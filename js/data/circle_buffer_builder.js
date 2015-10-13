'use strict';

var BufferBuilder = require('./buffer_builder');
var util = require('../util/util');

module.exports = CircleBufferBuilder;

var EXTENT = 4096;

function CircleBufferBuilder() {
    BufferBuilder.apply(this, arguments);
}

CircleBufferBuilder.prototype = util.inherit(BufferBuilder, {});

CircleBufferBuilder.prototype.addFeature = function(feature) {

    var geometries = feature.loadGeometry()[0];
    for (var j = 0; j < geometries.length; j++) {
        this.elementGroups.circle.makeRoomFor(6);

        var x = geometries[j].x;
        var y = geometries[j].y;

        // Do not include points that are outside the tile boundaries.
        if (x < 0 || x >= EXTENT || y < 0 || y >= EXTENT) continue;

        // this geometry will be of the Point type, and we'll derive
        // two triangles from it.
        //
        // ┌─────────┐
        // │ 3     2 │
        // │         │
        // │ 0     1 │
        // └─────────┘

        var vertex0 = this.addCircleVertex(x, y, -1, -1);
        var vertex1 = this.addCircleVertex(x, y, 1, -1);
        var vertex2 = this.addCircleVertex(x, y, 1, 1);
        var vertex3 = this.addCircleVertex(x, y, -1, 1);

        this.addCircleElement(vertex0, vertex1, vertex2);
        this.addCircleElement(vertex0, vertex3, vertex2);
    }

};