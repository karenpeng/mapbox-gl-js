'use strict';

var featureFilter = require('feature-filter');

var StyleDeclarationSet = require('../style/style_declaration_set');
var LayoutProperties = require('../style/layout_properties');
var ElementGroups = require('./element_groups');
var LayerType = require('../layer_type');
var Buffer = require('./buffer');

module.exports = BufferBuilder;

BufferBuilder.create = function(options) {
    var Classes = {
        fill: require('./fill_buffer_builder'),
        line: require('./line_buffer_builder'),
        circle: require('./circle_buffer_builder'),
        symbol: require('./symbol_buffer_builder')
    };

    return new Classes[options.layer.type](options);
};

function BufferBuilder(options) {
    this.type = LayerType[options.layer.type];
    this.layer = options.layer;
    this.layers = [this.layer.id];
    this.z = options.zoom;
    this.zoom = options.zoom;
    this.overscaling = options.overscaling;
    this.collisionDebug = options.collisionDebug;
    this.id = options.layer.id;
    this['source-layer'] = options.layer['source-layer'];
    this.interactive = options.layer.interactive;
    this.minZoom = options.layer.minzoom;
    this.maxZoom = options.layer.maxzoom;
    this.filter = featureFilter(options.layer.filter);
    this.features = [];

    this.buffers = createBuffers(this.type.shaders, options.buffers);
    this.layoutProperties = createLayoutProperties(this.layer, this.zoom);
    this.elementGroups = createElementGroups(this.type.shaders, this.buffers);

    for (var shaderName in this.type.shaders) {
        var shader = this.type.shaders[shaderName];

        var vertexName = this.getAddVertexMethodName(shaderName);
        var elementName = this.getAddElementMethodName(shaderName, false);
        var secondElementName = this.getAddElementMethodName(shaderName, true);

        this[vertexName] = createVertexAddMethod(shader);
        this[elementName] = createElementAddMethod(shader);
        this[secondElementName] = createElementAddMethod(shader, true);
    }
};

BufferBuilder.prototype.getAddVertexMethodName = function(shaderName) {
    var shader = this.type.shaders[shaderName];
    return 'add' + capitalize(shader.vertexBuffer);
};

BufferBuilder.prototype.getAddElementMethodName = function(shaderName, isSecond) {
    var shader = this.type.shaders[shaderName];
    var bufferName = isSecond ? shader.secondElementBuffer : shader.elementBuffer;

    if (bufferName) return 'add' + capitalize(bufferName);
    else return null;
};

BufferBuilder.prototype.addFeatures = function() {
    for (var i = 0; i < this.features.length; i++) {
        this.addFeature(this.features[i]);
    }
};

BufferBuilder.prototype.makeRoomFor = function(shaderName, vertexLength) {
    this.elementGroups[shaderName].makeRoomFor(vertexLength);
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
};

function createVertexAddMethod(shader) {
    if (!shader.vertexBuffer) return;

    // Find max arg length of all attribute value functions
    var argCount = 0;
    for (var i = 0; i < shader.attributes.length; i++) {
        argCount = Math.max(shader.attributes[i].value.length, argCount);
    }

    var argIds = [];
    for (var j = 0; j < argCount; j++) {
        argIds.push('a' + j);
    }

    var body = '';
    body += 'var elementGroups = this.elementGroups.' + shaderName + ';\n';
    body += 'elementGroups.current.vertexLength++;\n';
    body += 'var attributes = this.type.shaders.' + shaderName + '.attributes;\n';
    body += 'return this.buffers.' + shader.vertexBuffer + '.push(\n';

    for (var k = 0; k < shader.attributes.length; k++) {
        var attribute = shader.attributes[k];
        body += '  attributes[' + k + '].value(' + argIds.join(', ') + ')';
        body += (k !== shader.attributes.length - 1) ? ',\n' : '';
    }
    body += '\n) - elementGroups.current.vertexStartIndex;';

    return new Function(argIds, body);
};

function createElementAddMethod(shaderName, isSecond) {
    var bufferName = isSecond ? shader.secondElementBuffer : shader.elementBuffer;
    if (!bufferName) return;
    var lengthName = isSecond ? 'secondElementLength' : 'elementLength';

    return function() {
        this.elementGroups[shaderName].current[lengthName]++;
        return this.buffers[bufferName].push(arguments);
    };
};

function createElementGroups(shaders, buffers) {
    var elementGroups = {};
    Object.keys(shaders).forEach(function(shaderName) {
        var shader = shaders[shaderName];
        elementGroups[shaderName] = new ElementGroups(
            buffers[shader.vertexBuffer],
            buffers[shader.elementBuffer],
            buffers[shader.secondElementBuffer]
        );
    });
    return elementGroups;
};

function createBuffers(shaders, buffers) {
    buffers = buffers || {};

    Object.keys(shaders).forEach(function(shaderName) {
        var shader = shaders[shaderName];

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
    });

    return buffers;
};

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
