/*
* Copyright (c) 2013, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* GIFter.js - <canvas> to GIF recorder
*/

(function() {
	function GIFter(width, height, opts) {
		this.width = width;
		this.height = height;
		// frame crop offsets
		this.cropTo = opts.cropTo || [0,0];
		// 0: infinite; undefined: off
		this.loop = opts.loop;
		// default frame delay (in multiples of 10ms)
		this.frameDelay = opts.frameDelay || 2;
		// last frame delay
		this.loopDelay = opts.loopDelay || this.frameDelay;
		// global palette
		this.palette = opts.palette || [0];		// pre-init transparent
		// indexed frames
		this.iframes = [];
		// merged iframes (for diffing)
		this.iframe = null;
		// memoized frame dims for scaling
		this.frameDims = {width: null, height: null};
		// background index
		this.background = opts.background;
	}

	// @frame: Context2d object
	// TODO: make use of per-frame @opts
	GIFter.prototype.addFrame = function addFrame(frame, opts) {
		var frmPal = indexFrame(frame, this.palette, this.cropTo);

		if (this.iframes.length == 0) {
			var iframe = frmPal.iframe;
			this.iframe = new Uint8Array(iframe);

			// memoize
			this.frameDims.width = frame.canvas.width;
			this.frameDims.height = frame.canvas.height;
		}
		else
			var iframe = sparseDiff(this.iframe, frmPal.iframe, 0, true);

		this.iframes.push(iframe);
	};

	GIFter.prototype.encode = function encode() {
		// coerce palette to power of 2; cleverness on loan from http://www.mrdoob.com/lab/javascript/omggif/
		var powof2 = 1;
		while (powof2 < this.palette.length)
			powof2 <<= 1;
		this.palette.length = powof2;

		// FIXME: find a way to approximate appropriate buffer size
		var buf = new Uint8Array(1024 * 1024),
			opts = {
				loop: this.loop,
				palette: this.palette,
			},
			enc = new GifWriter(buf, this.width, this.height, opts);

		var last = this.iframes.length - 1, scaled, iframeScaled;
		for (var i in this.iframes) {
			iframeScaled = scaleTo(this.iframes[i], this.frameDims.width, this.frameDims.height, this.width, this.height);
			enc.addFrame(0, 0, this.width, this.height, iframeScaled, {delay: (i == last ? this.loopDelay : this.frameDelay), transparent: 0});
		}

		return buf.subarray(0, enc.end());
	};

	GIFter.prototype.render = function render() {
		var img = document.createElement("img"),
			blob = this.encode();

		img.src = "data:image/gif;base64," + base64ArrayBuffer(blob);

		return img;
	};

	// alpha-composes via drawImage
	function composeLayers(canvases, tmpCtx, bgColor) {
		if (bgColor) {
			tmpCtx.fillStyle = bgColor;
			tmpCtx.fillRect(0, 0, tmpCtx.canvas.width, tmpCtx.canvas.height);
		}

		for (var i in canvases)
			tmpCtx.drawImage(canvases[i], 0, 0);

		return tmpCtx;
	}

	// computes sparse delta between 2 arrays
	// optionally merges B into A in-place
	function sparseDiff(arrA, arrB, sameVal, merge) {
		sameVal = sameVal || 0;
		merge = merge || false;

		var tmp = new Uint8Array(arrA.length);

		for (var i in arrA) {
			if (arrA[i] === arrB[i])
				tmp[i] = sameVal;
			else {
				tmp[i] = arrB[i];

				if (merge)
					arrA[i] = arrB[i];
			}
		}

		return tmp;
	}

	// converts frame into indexed frame, using/adding to the passed palette or fresh one
	function indexFrame(frame, palette, cropTo, numColors, quantMeth) {
		palette = palette || [];		// [0] ?
		numColors = numColors || 256;

		var imgd = frame.getImageData(cropTo[0], cropTo[1], frame.canvas.width, frame.canvas.width),
			iframe = new Uint8Array(imgd.data.length / 4),
			buf32 = new Uint32Array(imgd.data.buffer);

		var len = buf32.length;
		for (var i = 0; i < len; i++) {
			// shift off alpha
			var col = swap32(buf32[i]) >>> 8,
				idx = palette.indexOf(col);

			if (idx == -1) {
				palette.push(col);
				idx = palette.length - 1;
			}

			iframe[i] = idx;
		}

		return {iframe: iframe, palette: palette};
	}

	// endianness inversion
	// http://stackoverflow.com/questions/5320439/how-do-i-swap-endian-ness-byte-order-of-a-variable-in-javascript/5320624#5320624
	function swap32(val) {
		return ((val & 0xFF) << 24)
			   | ((val & 0xFF00) << 8)
			   | ((val >> 8) & 0xFF00)
			   | ((val >> 24) & 0xFF);
	}

	// ported from http://tech-algorithm.com/articles/nearest-neighbor-image-scaling/
	function scaleTo(pxls,w1,h1,w2,h2) {
		var out = new Uint8Array(w2*h2),
			rx = w1/w2,
			ry = h1/h2,
			px, py;

		for (var i=0;i<h2;i++) {
			for (var j=0;j<w2;j++) {
				px = Math.floor(j*rx);
				py = Math.floor(i*ry);
				out[i*w2+j] = pxls[py*w1+px];
			}
		}

		return out;
	}

	GIFter.composeLayers = function(canvases, bgColor) {
		if (!GIFter.tmpCtx) {
			var tmpCan = document.createElement("canvas"),
				tmpCtx = tmpCan.getContext("2d");

			tmpCan.width = canvases[0].width;
			tmpCan.height = canvases[0].height;

			GIFter.tmpCan = tmpCan;
			GIFter.tmpCtx = tmpCtx;
		}

		return composeLayers(canvases, GIFter.tmpCtx, bgColor);
	};

	this.GIFter = GIFter;

})(this);