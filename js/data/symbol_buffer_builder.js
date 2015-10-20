'use strict';

var Point = require('point-geometry');

var BufferBuilder = require('./buffer_builder');
var ElementGroups = require('./element_groups');
var Anchor = require('../symbol/anchor');
var getAnchors = require('../symbol/get_anchors');
var resolveTokens = require('../util/token');
var Quads = require('../symbol/quads');
var Shaping = require('../symbol/shaping');
var resolveText = require('../symbol/resolve_text');
var mergeLines = require('../symbol/mergelines');
var clipLine = require('../symbol/clip_line');
var CollisionFeature = require('../symbol/collision_feature');
var util = require('../util/util');
var SymbolLayerType = require('../layer_type/symbol_layer_type');

var shapeText = Shaping.shapeText;
var shapeIcon = Shaping.shapeIcon;
var getGlyphQuads = Quads.getGlyphQuads;
var getIconQuads = Quads.getIconQuads;

module.exports = SymbolBufferBuilder;

function SymbolBufferBuilder(options) {
    BufferBuilder.apply(this, arguments);
    this.collisionDebug = options.collisionDebug;
    this.overscaling = options.overscaling;
}

SymbolBufferBuilder.prototype = util.inherit(BufferBuilder, {});

SymbolBufferBuilder.prototype.type = SymbolLayerType;

SymbolBufferBuilder.prototype.addFeatures = function(collisionTile, stacks, icons) {
    SymbolLayerType.build(this.features, this, collisionTile, stacks, icons);
};

SymbolBufferBuilder.prototype.updateIcons = function(icons) {
    var iconValue = this.layoutProperties['icon-image'];
    if (!iconValue) return;

    for (var i = 0; i < this.features.length; i++) {
        var iconName = resolveTokens(this.features[i].properties, iconValue);
        if (iconName)
            icons[iconName] = true;
    }
};

SymbolBufferBuilder.prototype.placeFeatures = function() {
    return;
}

SymbolBufferBuilder.prototype.updateFont = function(stacks) {
    var fontName = this.layoutProperties['text-font'],
        stack = stacks[fontName] = stacks[fontName] || {};

    this.textFeatures = resolveText(this.features, this.layoutProperties, stack);
};
