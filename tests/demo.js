function load(src, fn) {
	var can = document.createElement('canvas'),
		ctx = can.getContext('2d');

	var img = new Image();
	img.onload = function(){
		can.width = img.width;
		can.height = img.height;
		ctx.drawImage(img, 0, 0, img.width, img.height);

		fn && fn.call(this, ctx);
	}

	img.src = src;
}

$(function() {
	var srcs = ['8x8-0.png','8x8-1.png'], dfds = [];

	srcs.forEach(function(src) {
		var $dfd = new $.Deferred();

		load(src, function(ctx) {
			$dfd.resolve(ctx);
		});

		dfds.push($dfd);
	});

	$.when.apply($, dfds).then(function(frame1, frame2) {
		var width = 128,
			height = 128,
			opts = {
				loop: 0,
				loopDelay: 50,
				frameDelay: 25,
			//	cropTo: [2,2],
			};
		var gif = new GIFter(width, height, opts);
		gif.addFrame(frame1);

		var compFrame = GIFter.composeLayers([frame1.canvas, frame2.canvas]);
		gif.addFrame(compFrame);

		var img = gif.render();

		$(img).appendTo(document.body);
	});
});