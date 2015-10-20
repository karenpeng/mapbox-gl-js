'use strict';

var Buffer = require('../data/buffer');

var EXTENT = 4096;

module.exports = {

    name: 'circle',

    shaders: {
        circle: {

            vertexBuffer: 'circleVertex',

            elementBuffer: 'circleElement',

            attributes: [{
                name: 'pos',
                components: 2,
                type: Buffer.AttributeType.SHORT,
                value: function(x, y, extrudeX, extrudeY) {
                    return [
                        (x * 2) + ((extrudeX + 1) / 2),
                        (y * 2) + ((extrudeY + 1) / 2)
                    ];
                }
            }]

        }
    },

    build: function(features, builder) {

        for (var i = 0; i < features.length; i++) {
            addFeature(features[i]);
        }

        function addFeature(feature) {
            var geometries = feature.loadGeometry()[0];
            for (var j = 0; j < geometries.length; j++) {
                builder.makeRoomFor('circle', 6);

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

                var vertex0 = builder.addCircleVertex(x, y, -1, -1);
                var vertex1 = builder.addCircleVertex(x, y, 1, -1);
                var vertex2 = builder.addCircleVertex(x, y, 1, 1);
                var vertex3 = builder.addCircleVertex(x, y, -1, 1);

                builder.addCircleElement(vertex0, vertex1, vertex2);
                builder.addCircleElement(vertex0, vertex3, vertex2);
            }
        }

    }

};
