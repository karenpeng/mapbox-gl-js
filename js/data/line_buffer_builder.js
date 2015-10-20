'use strict';

var BufferBuilder = require('./buffer_builder');
var util = require('../util/util');
var LineLayerType = require('../layer_type/line_layer_type');

module.exports = LineBufferBuilder;

function LineBufferBuilder() {
    BufferBuilder.apply(this, arguments);
}

LineBufferBuilder.prototype = util.inherit(BufferBuilder, {});

LineBufferBuilder.prototype.type = LineLayerType;

LineBufferBuilder.prototype.addFeatures = function() {
    LineLayerType.build(this.features, this);
};
