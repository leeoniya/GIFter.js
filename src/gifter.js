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

		opts = opts || {};

		// init'd to full frame on first addFrame() if not provided
		this.cropBox = opts.cropBox;
		// background index
		this.background = opts.background;
		// 0: infinite; undefined: off
		this.loop = opts.loop;
		// default frame delay (in multiples of 10ms)
		this.frameDelay = opts.frameDelay || 2;
		// last frame delay
		this.loopDelay = opts.loopDelay || this.frameDelay;
		// global palette (pre-init transparent)
		this.palette = opts.palette || [-1];
		// Uint32Array view of croppedFrame imageData for diffing
		this.frame = null;
		// indexed frames [[lft,top,width,height,ipxls,opts]]
		this.iframes = [];
		// temp context for composing layers
		this._tmpCtx = null;
	}

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

		var last = this.iframes.length - 1, iframeScaled, iframe;
		for (var i in this.iframes) {
			iframe = this.iframes[i];

			var rx = this.width / this.cropBox[2],
				ry = this.height / this.cropBox[3],
				x = iframe[0] * rx,
				y = iframe[1] * ry,
				w = iframe[2] * rx,
				h = iframe[3] * ry;

			iframeScaled = scaleTo(iframe[4], iframe[2], iframe[3], iframe[2] * rx, iframe[3] * ry);

			// TODO: merge in per-frame opts
			enc.addFrame(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h), iframeScaled, {delay: (i == last ? this.loopDelay : this.frameDelay), transparent: 0});
		}

		return buf.subarray(0, enc.end());
	};

	GIFter.prototype.render = function render() {
		var img = document.createElement("img"),
			blob = this.encode();

		img.src = "data:image/gif;base64," + base64ArrayBuffer(blob);

		return img;
	};

	// creates/caches and returns context for layer composing
	GIFter.prototype.getTmpCtx = function getTmpCtx(width, height) {
		if (!this._tmpCtx) {
			var can = document.createElement("canvas"),
				ctx = can.getContext("2d");

			can.width = width;
			can.height = height;

			this._tmpCtx = ctx;
		}

		return this._tmpCtx;
	};

	// alpha-compose via drawImage
	// @lyrs: array of <canvas> and/or <img> elements
	GIFter.prototype.composeLayers = function composeLayers(lyrs, noClear) {
		var w = lyrs[0].width
			h = lyrs[0].height;

		var ctx = this.getTmpCtx(w, h);

		if (!noClear)
			ctx.clearRect(0, 0, w, h);

		for (var i in lyrs)
			ctx.drawImage(lyrs[i], 0, 0);

		return ctx;
	};

	// @lyrs: array of <canvas> and/or <img> elements
	// @opts: frame-specific opts
	GIFter.prototype.addFrame = function addFrame(lyrs, opts) {
		if (!(lyrs instanceof Array))
			lyrs = [lyrs];

		opts = opts || {};

		var frame2d = this.composeLayers(lyrs);

		// initial frame
		if (!this.frame) {
			if (!this.cropBox)
				this.cropBox = [0, 0, lyrs[0].width, lyrs[0].height];

			var imgd = frame2d.getImageData.apply(frame2d, this.cropBox);

			var frame = new Uint32Array(imgd.data.buffer);
			this.frame = frame;

			this.iframes.push([0, 0, imgd.width, imgd.height, this.indexFrame(frame), opts]);
		}
		else {
			// TODO: if no diff found, increase delay of prior frame
			// crop frame to smaller of diffBox or cropBox
			var diffBox = opts.diffBox;

			if (!diffBox) {
				var imgd = frame2d.getImageData.apply(frame2d, this.cropBox);

				var frame32 = new Uint32Array(imgd.data.buffer);

				diffBox = this.findDiffBox(this.frame, frame32);
			}

			var diffBoxRel = [
				diffBox[0] - this.cropBox[0],
				diffBox[1] - this.cropBox[1],
				diffBox[2],
				diffBox[3]
			];

			// current
			var diffCur = crop(this.frame, this.cropBox[2], diffBoxRel);
			// new one
			var imgd = frame2d.getImageData.apply(frame2d, diffBox);
			var diffNew = new Uint32Array(imgd.data.buffer);

			// compute diff
			var frame = sparseDiff(diffCur, diffNew, 0, true);

			// update base frame
			place(diffCur, imgd.width, this.frame, this.cropBox[2], diffBoxRel[0], diffBoxRel[1]);

			this.iframes.push([diffBoxRel[0], diffBoxRel[1], imgd.width, imgd.height, this.indexFrame(frame), opts]);
		}
	};

	// TODO: implement lft/top/rgt/btm diffBox extractor
	// maybe no frameA on proto impl
	GIFter.prototype.findDiffBox = function findDiffBox(frameA, frameB) {
		return this.cropBox;
	};

	// converts frame into indexed frame, using/updating global palette
	// TODO: use numColors and quantMeth, maybe dep-inject the quantizer
	GIFter.prototype.indexFrame = function indexFrame(frame32, numColors, quantMeth) {
		var len = frame32.length,
			iframe = new Uint8Array(len),
			palette = this.palette;

		for (var i = 0; i < len; i++) {
			var isTrans = (frame32[i] >>> 24) === 0,
				col = isTrans ? -1 : swap32(frame32[i]) >>> 8,	// shift off alpha
				idx = palette.indexOf(col);

			if (idx == -1) {
				palette.push(col);
				idx = palette.length - 1;
			}

			iframe[i] = idx;
		}

		return iframe;
	};

	// endianness inversion
	// http://stackoverflow.com/questions/5320439/how-do-i-swap-endian-ness-byte-order-of-a-variable-in-javascript/5320624#5320624
	function swap32(val) {
		return ((val & 0xFF) << 24)
			   | ((val & 0xFF00) << 8)
			   | ((val >> 8) & 0xFF00)
			   | ((val >> 24) & 0xFF);
	}

	// ported from http://tech-algorithm.com/articles/nearest-neighbor-image-scaling/
	// TODO: add interpolationMeth
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

	// computes sparse delta between 2 arrays
	// optionally merges B into A in-place
	function sparseDiff(arrA, arrB, sameVal, merge) {
		sameVal = sameVal || 0;
		merge = merge || false;

		var tmp = new Uint32Array(arrA.length);

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

	// analog to getImageData
	function crop(pxls, width, cropBox) {
		var x0 = cropBox[0],
			y0 = cropBox[1],
			w  = cropBox[2],
			h  = cropBox[3],
			x1 = x0 + w,
			y1 = y0 + h;

		var type = Object.prototype.toString.call(pxls).slice(8,-1),
			out = new window[type](w*h);

		var idx, sub;
		for (var ln = y0; ln < y1; ln++) {
			idx = (ln * width) + x0;
			sub = pxls.subarray(idx, idx + w);
			out.set(sub, (ln - y0) * w);
		}

		return out;
	}

	// analog to putImageData
	function place(src, srcW, dst, dstW, x, y) {
		var h = src.length / srcW;

		var idx, sub;
		for (var ln = 0; ln < h; ln++) {
			idx = ln * srcW;
			sub = src.subarray(idx, idx + srcW);
			dst.set(sub, (y + ln) * dstW + x);
		}
	}

	this.GIFter = GIFter;

})(this);