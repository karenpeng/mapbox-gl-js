'use strict';

var BufferBuilder = require('./buffer_builder');
var util = require('../util/util');
var FillLayerType = require('../layer_type/fill_layer_type');

module.exports = FillBufferBuilder;

function FillBufferBuilder() {
    BufferBuilder.apply(this, arguments);
}

FillBufferBuilder.prototype = util.inherit(BufferBuilder, {});

FillBufferBuilder.prototype.type = FillLayerType;

FillBufferBuilder.prototype.addFeatures = function() {
    FillLayerType.build(this.features, this);
};
