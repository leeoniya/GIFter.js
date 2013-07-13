&#x1f381; GIFter.js
-------------------
&lt;canvas&gt; to GIF recorder _(MIT Licensed)_

---
### Intro

Wait, *another<sup>1</sup>* js GIF recorder? Well, yes and no. GIFter.js does record gifs, but it's designed for a specific purpose and offers some unique features which facilitate this. That purpose is to record canvas graphics, animations and pixel-art sprites rather than encoding photos and movie clips. Keeping this in mind, the lib *can* be used as a general-purpose gif recorder with some settings adjustments (see below).

*<sup>1</sup>* [gif.js](https://github.com/jnordberg/gif.js), [jsgif](https://github.com/antimatter15/jsgif), [mothereffinganimatedgif](https://github.com/h5bp/mothereffinganimatedgif), [Animated_GIF](https://github.com/sole/Animated_GIF)

---
### Features

- **Small output** - Compact filesize is achieved via sequential frame differencing, computation of an optimal, global color palette and identical frame grouping (todo).
- **High quality** - Artifact-free with a good balance between gradient quality and localized detail retention.
- **Fast processing** - Color-remap memoization keeps frame processing fast for graphics. However, photographs and images with complex color gradients perform more slowly.
- **Scaling** - Nearest-neighbor scaling avoids interpolation = crisp, pixelated, upscaling goodness.
- **Cropping** - Record only a portion of the full frame.
- **Layers** - Compose several canvas layers in a single frame.
- **Web-worker ready** - internal methods do not rely on Canvas for cropping, scaling, or layers via alpha composition.
- **Pluggable quantizer** - [RgbQuant.js](https://github.com/leeoniya/RgbQuant.js) is used by default, but others such as NeuQuant.js, median-cut-js, etc. can be shimmed in its place (see caveats below).

---
### Basic Usage

**Use Chrome or Firefox**, some HTML5/JS features are used - Canvas, Typed Arrays, Array.forEach, Webworkers (soon).

```js
// options
var width  = 128,
	height = 128,
	opts = {
		loop: 0,
		loopDelay:  50,
		frameDelay: 25,
	//	cropBox: [2,2,5,5],
	};

var gif = new GIFter(width, height, opts);

// layer0 and layer1 are <img> and/or <canvas> elements
gif.addFrame(layer0);
// multi-layer frame
gif.addFrame([layer0, layer1]);

// execute encoder
var img = gif.render();

// lets see it!
document.body.appendChild(img);
```

See `/tests` directory for demo

---
### Quantizer Swappage

First, a word of caution. RgbQuant.js supports multi-image palletization, a method that builds up a single palette of 256 most-important colors using multiple sampled frames. This is why GIFter.js employs an explicit palatte building step in global-palette mode. Other quantizers that I've encountered cannot work this way; they will produce a fixed-size palette only from a single image.

In theory, it is possible to then take many frames' palettes and combine them into a single, reduced one, but you would need to implement this for each quantizer. Additionally, merging multiple palettes may negate any quality gained through spatial analysis of each individual image.

So, swapping the quantizer while maintaining a single global palette (and small fileszie) is not a trivial endeavor. However, if palette-per-frame operation is acceptable or desired, the quantizer can be swapped out with relative ease. Consider yourselves ~~warned~~ informed :)

---
### Notes

- Per-frame options are not implemented yet, though they are supported by the omggif encoder.
- Framerate is limited to 50fps. This is a browser vendor decision. 20ms is the smallest possible frame delay.
- If you need absolute smallest filesize, compress the resulting GIFs with [gifsicle](https://github.com/kohler/gifsicle).

---
### Dependencies

  - [omggif](https://github.com/deanm/omggif) - GIF89a encoder
  - [base64ArrayBuffer](https://gist.github.com/jonleighton/958841) - base64 encoder

*included in `/lib`*