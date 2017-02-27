/*
* Copyright (c) 2017, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* GIFter.js - <canvas> to GIF recorder
*/

(function() {
	// final width & height, frames will be scaled to these automaticlly
	function GIFter(width, height, opts) {
		opts = opts || {};

		// output dims, input will be scaled to these
		this.width = width;
		this.height = height;

		// 0: no diff, fast, mem-hungry, large output
		// 1: scene mode, frames are stored as deltas, so no color->trans possible
		//    eg: http://cdn.shopify.com/s/files/1/0186/8104/files/Super_Mario_World_GIF-6_grande.gif
		// 2: sprite mode, each frame replaces all previous; full disposal, color->trans okay
		//    eg: http://www.dan-dare.org/SonicMario/SonicMario.htm
		this.diffMode = (opts.diffMode === 0) ? 0 : (opts.diffMode || 1);

//		this.quantMode = 0 || 1		// local or global

		// portion of passed frames to grab. default = full frame.
		this.cropBox = opts.cropBox;
		// background color? index?
		this.background = opts.background;
		// 0: infinite; undefined: off
		this.loop = opts.loop;
		// default frame delay (in multiples of 10ms)
		this.frameDelay = opts.frameDelay || 2;				// trueSpeed (try using timestamps for delay calc)
		// last frame delay
		this.loopDelay = opts.loopDelay || this.frameDelay;
		// global palette (pre-init transparent)
		this.palette = opts.palette || [0];						// [-1];

		// sampling: use a ramping function?
		// sampling interval
		this.sampleInt = opts.sampleInt || 1;
		// sampling total frame count
		this.sampleQty = opts.sampleQty || 30;
		// sample frame counter
		this.sampleCtr = 0;

		// temp context (size of cropBox) for assembling layers
		this._tmpCtx = null;

		// frames held here (as diffs)
		this.frames = [];
		// currently placed pixels (Uint32Array)
		this.stage = null;

		this.quantOpts = opts.quantOpts || {};

		this.encOpts = opts.encOpts || {};

		this.quantizer = new RgbQuant(this.quantOpts);		// should be fn to have pluggable quantizer, quantopts may have color count at 255 if transparent index is present
		this.encoder = null;
	}

	// @lyrs: array of <canvas> and/or <img> elements			// TODO: accept typed arrays, imagedata
	// @opts: frame-specific opts
	GIFter.prototype.addFrame = function addFrame(lyrs, opts) {
		// maybe if layers is blank, assume not changes, increment by amount in opts or global frameDelay
		if (!(lyrs instanceof Array))
			lyrs = [lyrs];

//		if (this.trueSpeed)			// will only work well in workers
//			var time = +(new Date);

		opts = opts || {};

		var cropBox = opts.cropBox || this.cropBox || [0, 0, lyrs[0].naturalWidth || lyrs[0].width, lyrs[0].naturalHeight || lyrs[0].height];

		// make cropped, composed frame
		var frame32 = this.composeLayers(lyrs, cropBox);

		// disposal mode
		var disp = (this.diffMode == 1) ? 0 : 2;

		if (this.diffMode == 0 || this.stage === null) {
			var diff = {
				bbox: [0, 0, cropBox[2], cropBox[3]],
				data: frame32,
			};
		}
		else if (this.diffMode == 2) {
			var cont = frameCont(frame32, cropBox[2]);
			// TODO: still need to real diff it via sameFrame, at least compare diffbox with prior
			var diff = cont;
		}
		else
			var diff = frameDiff(this.stage, frame32, cropBox[2]);

		if (diff === null) {
			//increase last frame's delay
			this.frames[this.frames.length - 1].delay += (opts.delay || this.frameDelay);
			return;
		}

		this.frames.push({
			bbox: diff.bbox,
			data: diff.data,
			delay: opts.delay || this.frameDelay,
			disp: disp,
			pal: null,
			indxd: null,
		});

		this.stage = frame32;

		// must sample here (live), since frames are stored as deltas
		var lastIdx = this.frames.length - 1;
		if (this.sampleCtr < this.sampleQty && lastIdx % this.sampleInt == 0) {
		//	console.log("Sampling frame " + this.frames.length);
			this.quantizer.sample(this.stage);
			this.sampleCtr++;
		}

		// if liveEncode with no quant?
		// this.iframes.push([0, 0, imgd.width, imgd.height, this.indexFrame(frame), opts]);
	};

	// creates/caches and returns context for layer composing
	// DOM-enabled only
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

	// alpha-compose + crop via drawImage to cropbox sized canvas
	// @lyrs: array of <canvas> and/or <img> elements
	// cropBox must be set
	// lyrs2CroppedCtx
	GIFter.prototype.composeLayers = function composeLayers(lyrs, cropBox) {
		var w = cropBox[2],
			h = cropBox[3];

		var ctx = this.getTmpCtx(w, h);

		ctx.clearRect(0, 0, w, h);

		for (var i in lyrs)
			ctx.drawImage(lyrs[i], -cropBox[0], -cropBox[1]);

		var imgd = ctx.getImageData(0, 0, w, h);

		return new Uint32Array(imgd.data.buffer);
	};

	GIFter.prototype.complete = function complete() {
		this.buildPalette();
		this.indexFrames();
		return this.render();
	};

	// not for live use
	GIFter.prototype.buildPalette = function buildPalette() {
//		console.log("Building palette...");
		this.palette = this.quantizer.palette(true).map(function(rgb){
			return (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
		});

		// offset indices to account for [0] transparent (TODO: diffmode 1 and 2 only)
		this.palette.unshift(0);

		return this.palette;
	};

	// not for live use
	GIFter.prototype.indexFrames = function indexFrames() {
//		console.log("Reducing & indexing...");
		for (var i in this.frames) {
			this.frames[i].indxd = this.quantizer.reduce(this.frames[i].data, 2)
				// offset indices to account for [0] transparent (TODO: diffmode 1 and 2 only)
				.map(function(i) { return i === null ? 0 : i + 1; });
		}
	};

	//
	GIFter.prototype.encode = function encode() {
//		console.log("Encoding frames...");
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

		var last = this.frames.length - 1, iframeScaled, iframe,
			// use first frame's bbox to determine scale factor for all (maybe revisit for sprites)
			rx = this.width / this.frames[0].bbox[2],
			ry = this.height / this.frames[0].bbox[3];

		for (var i in this.frames) {
			iframe = this.frames[i];

			var x = Math.floor(iframe.bbox[0] * rx),
				y = Math.floor(iframe.bbox[1] * ry),
				w = Math.floor(iframe.bbox[2] * rx),
				h = Math.floor(iframe.bbox[3] * ry);

			// FIXME: frames need to be scaled from a uniform external ref point so that
			// rounding doesnt fuck up consistency across varying size & pos delta frames
			// when scale factor is not an even number
			iframeScaled = scaleTo(iframe.indxd, iframe.bbox[2], iframe.bbox[3], w, h);

			// TODO: merge in per-frame opts
			var fopts = {
				delay: (i == last ? this.loopDelay : this.frameDelay),
				transparent: 0,
				disposal: iframe.disp,
			};

			enc.addFrame(x, y, w, h, iframeScaled, fopts);
		}

		return buf.subarray(0, enc.end());
	};

	GIFter.prototype.render = function render() {
		var img = document.createElement("img"),
			blob = this.encode();

		img.src = "data:image/gif;base64," + base64ArrayBuffer(blob);

		return img;
	};

	// computes delta between 2 frames returning minimum
	// required diffBox and pixels data. 0 = no change
	// TODO: indicate a *new* transparency with [255,255,255,0] ?
	function frameDiff(frameA, frameB, width) {
		var diffBox = getDiffBox(frameA, frameB, width);

		if (diffBox === null) return null;

		var data = new Uint32Array(diffBox[2] * diffBox[3]);

		var j = 0;
		iterBox(diffBox, width, function(i) {
			data[j++] = frameA[i] === frameB[i] ? 0 : frameB[i];
		});

		return {
			data: data,
			bbox: diffBox,
		};
	}

	// get frame's content (non-transparent region)
	function frameCont(frameA, width) {
		var contBox = getContBox(frameA, width);

		if (contBox === null) return null;

		return {
			data: cropArr(frameA, width, contBox),
			bbox: contBox,
		}
	}

	// analog to getImageData
	function cropArr(pxls, width, cropBox) {
//		var data = getImageData(pxls, width);

		// crop using canvas if available
//		if (data.imgd) {
//			var imgd = frame.getImageData.apply(frame, cropBox);
//		}
//		else {
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
//		}
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

	function getDiffBox(arrA, arrB, w) {
		var cmpFn = function(i) {
			return arrA[i] !== arrB[i];
		};

		return getBox(w, arrA.length / w, cmpFn);
	}

	function getContBox(arrA, w) {
		var cmpFn = function(i) {
			return (arrA[i] & 0xff000000) >> 24 != 0;
		};

		return getBox(w, arrA.length / w, cmpFn);
	}

	// fast code ain't pretty
	// @cmpFn: breaking condition tester
	function getBox(w, h, cmpFn) {
		var i, x, y,
			len = w * h,
			top = null,
			btm = null,
			lft = null,
			rgt = null;

		// top
		i = 0;
		do {
			if (cmpFn(i)) {
				top = ~~(i / w);
				break;
			}
		} while (i++ < len);

		if (top === null)
			return null;

		// btm
		i = len;
		do {
			if (cmpFn(i)) {
				btm = ~~(i / w);
				break;
			}
		} while (i-- > 0);

		// lft
		x = 0;
		y = top;
		do {
			i = (w * y) + x;
			if (cmpFn(i)) {
				lft = x;
				break;
			}
			if (y < btm)
				y++;
			else {
				y = 0;
				x++;
			}
		} while (i < len);

		// rgt
		x = w - 1;
		y = top;
		do {
			i = (w * y) + x;
			if (cmpFn(i)) {
				rgt = x;
				break;
			}
			if (y < btm)
				y++;
			else {
				y = 0;
				x--;
			}
		} while (i > 0);

		return [lft, top, rgt - lft + 1, btm - top + 1];
	}

	// iterates @bbox within a parent rect of width @wid; calls @fn, passing index within parent
	function iterBox(bbox, wid, fn) {
		var b = {x: bbox[0], y: bbox[1], w: bbox[2], h: bbox[3]},
			i0 = b.y * wid + b.x,
			i1 = (b.y + b.h - 1) * wid + (b.x + b.w - 1),
			cnt = 0, incr = wid - b.w + 1, i = i0;

		do {
			if (fn.call(this, i) === false)
				return;
			i += (++cnt % b.w == 0) ? incr : 1;
		} while (i <= i1);
	}

	this.GIFter = GIFter;

})(this);