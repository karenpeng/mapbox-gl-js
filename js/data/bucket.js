'use strict';

var featureFilter = require('feature-filter');

var StyleDeclarationSet = require('../style/style_declaration_set');
var LayoutProperties = require('../style/layout_properties');
var ElementGroups = require('./element_groups');
var Buffer = require('./buffer');
var assert = require('assert');

module.exports = Bucket;

/**
 * Instantiate the appropriate subclass of `Bucket` for `options`.
 * @private
 * @param options See `Bucket` constructor options
 * @returns {Bucket}
 */
Bucket.create = function(options) {
    var Classes = {
        fill: require('./fill_bucket'),
        line: require('./line_bucket'),
        circle: require('./circle_bucket'),
        symbol: require('./symbol_bucket')
    };
    return new Classes[options.layer.type](options);
};

Bucket.AttributeType = Buffer.AttributeType;

/**
 * The `Bucket` class builds a set of `Buffer`s for a set of vector tile
 * features.
 *
 * `Bucket` is an abstract class. A subclass exists for each Mapbox GL
 * style spec layer type. Because `Bucket` is an abstract class,
 * instances should be created via the `Bucket.create` method.
 *
 * For performance reasons, `Bucket` creates its "add"s methods at
 * runtime using `new Function(...)`.
 *
 * @class Bucket
 * @private
 * @param options
 * @param {number} options.zoom Zoom level of the buffers being built. May be
 *     a fractional zoom level.
 * @param options.layer A Mapbox GL style layer object
 * @param {Object.<string, Buffer>} options.buffers The set of `Buffer`s being
 *     built for this tile. This object facilitates sharing of `Buffer`s be
       between `Bucket`s.
 */
function Bucket(options) {
    this.layer = options.layer;
    this.zoom = options.zoom;

    this.layers = [this.layer.id];
    this.type = this.layer.type;
    this.features = [];
    this.id = this.layer.id;
    this['source-layer'] = this.layer['source-layer'];
    this.interactive = this.layer.interactive;
    this.minZoom = this.layer.minzoom;
    this.maxZoom = this.layer.maxzoom;
    this.filter = featureFilter(this.layer.filter);

    this.layoutProperties = createLayoutProperties(this.layer, this.zoom);

    this.resetBuffers(options.buffers);

    this.add = {};
    for (var shaderName in this.shaders) {
        var shader = this.shaders[shaderName];
        this[this.getAddMethodName(shaderName, 'vertex')] = createVertexAddMethod(shaderName, shader);
        this[this.getAddMethodName(shaderName, 'element')] = createElementAddMethod(shaderName, shader, false);
        this[this.getAddMethodName(shaderName, 'secondElement')] = createElementAddMethod(shaderName, shader, true);
    }
}

/**
 * Build the buffers! Features are set directly to the `features` property.
 * @private
 */
Bucket.prototype.addFeatures = function() {
    for (var i = 0; i < this.features.length; i++) {
        this.addFeature(this.features[i]);
    }
};

/**
 * Check if there is enough space available in the current element group for
 * `vertexLength` vertices. If not, append a new elementGroup. Should be called
 * by `addFeatures` and its callees.
 * @private
 * @param {string} shaderName the name of the shader associated with the buffer that will receive the vertices
 * @param {number} vertexLength The number of vertices that will be inserted to the buffer.
 */
Bucket.prototype.makeRoomFor = function(shaderName, vertexLength) {
    this.elementGroups[shaderName].makeRoomFor(vertexLength);
};

/**
 * Start using a new shared `buffers` object and recreate instances of `Buffer`
 * as necessary.
 * @private
 * @param {Object.<string, Buffer>} buffers
 */
Bucket.prototype.resetBuffers = function(buffers) {
    this.buffers = buffers;

    for (var shaderName in this.shaders) {
        var shader = this.shaders[shaderName];

        var vertexBufferName = shader.vertexBuffer;
        if (vertexBufferName && !buffers[vertexBufferName]) {
            buffers[vertexBufferName] = new Buffer({
                type: Buffer.BufferType.VERTEX,
                attributes: shader.attributes
            });
        }

        var elementBufferName = shader.elementBuffer;
        if (elementBufferName && !buffers[elementBufferName]) {
            buffers[elementBufferName] = createElementBuffer(shader.elementBufferComponents);
        }

        var secondElementBufferName = shader.secondElementBuffer;
        if (secondElementBufferName && !buffers[secondElementBufferName]) {
            buffers[secondElementBufferName] = createElementBuffer(shader.secondElementBufferComponents);
        }
    }

    this.elementGroups = createElementGroups(this.shaders, this.buffers);
};

/**
 * Get the name of the method used to add an item to a buffer.
 * @param {string} shaderName The name of the shader that will use the buffer
 * @param {string} type One of "vertex", "element", or "secondElement"
 * @returns {string}
 */
Bucket.prototype.getAddMethodName = function(shaderName, type) {
    return 'add' + capitalize(shaderName) + capitalize(type);
};

function createLayoutProperties(layer, zoom) {
    var values = new StyleDeclarationSet('layout', layer.type, layer.layout, {}).values();
    var fakeZoomHistory = { lastIntegerZoom: Infinity, lastIntegerZoomTime: 0, lastZoom: 0 };

    var layout = {};
    for (var k in values) {
        layout[k] = values[k].calculate(zoom, fakeZoomHistory);
    }

    if (layer.type === 'symbol') {
        // To reduce the number of labels that jump around when zooming we need
        // to use a text-size value that is the same for all zoom levels.
        // This calculates text-size at a high zoom level so that all tiles can
        // use the same value when calculating anchor positions.
        if (values['text-size']) {
            layout['text-max-size'] = values['text-size'].calculate(18, fakeZoomHistory);
            layout['text-size'] = values['text-size'].calculate(zoom + 1, fakeZoomHistory);
        }
        if (values['icon-size']) {
            layout['icon-max-size'] = values['icon-size'].calculate(18, fakeZoomHistory);
            layout['icon-size'] = values['icon-size'].calculate(zoom + 1, fakeZoomHistory);
        }
    }

    return new LayoutProperties[layer.type](layout);
}

function createVertexAddMethod(shaderName, shader) {
    if (!shader.vertexBuffer) return null;

    var pushArgs = [];
    for (var i = 0; i < shader.attributes.length; i++) {
        pushArgs = pushArgs.concat(shader.attributes[i].value);
    }

    var body = '';
    body += 'var elementGroup = this.elementGroups.' + shaderName + '.current;\n';
    body += 'elementGroup.vertexLength++;\n';
    body += 'return this.buffers.' + shader.vertexBuffer + '.push(\n    ' + pushArgs.join(',\n    ') + '\n) - elementGroup.vertexStartIndex;';

    return new Function(shader.attributeArgs, body);
}

function createElementAddMethod(shaderName, shader, isSecond) {
    var bufferName = isSecond ? shader.secondElementBuffer : shader.elementBuffer;
    if (!bufferName) return function() { assert(false); };
    var lengthName = isSecond ? 'secondElementLength' : 'elementLength';

    return function(one, two, three) {
        this.elementGroups[shaderName].current[lengthName]++;
        return this.buffers[bufferName].push(one, two, three);
    };
}

function createElementGroups(shaders, buffers) {
    var elementGroups = {};
    for (var shaderName in shaders) {
        var shader = shaders[shaderName];
        elementGroups[shaderName] = new ElementGroups(
            buffers[shader.vertexBuffer],
            buffers[shader.elementBuffer],
            buffers[shader.secondElementBuffer]
        );
    }
    return elementGroups;
}

function createElementBuffer(components) {
    return new Buffer({
        type: Buffer.BufferType.ELEMENT,
        attributes: [{
            name: 'vertices',
            components: components || 3,
            type: Buffer.ELEMENT_ATTRIBUTE_TYPE
        }]
    });
}

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
