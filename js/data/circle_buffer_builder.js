'use strict';

var BufferBuilder = require('./buffer_builder');
var util = require('../util/util');
var CircleLayerType = require('../layer_type/circle_layer_type');

module.exports = CircleBufferBuilder;

/**
 * Circles are represented by two triangles.
 *
 * Each corner has a pos that is the center of the circle and an extrusion
 * vector that is where it points.
 * @private
 */
function CircleBufferBuilder() {
    BufferBuilder.apply(this, arguments);
}

CircleBufferBuilder.prototype = util.inherit(BufferBuilder, {});

CircleBufferBuilder.prototype.type = CircleLayerType;

CircleBufferBuilder.prototype.addFeatures = function() {
    CircleLayerType.build(this.features, this);
};
