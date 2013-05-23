GIFter.js
---------
&lt;canvas&gt; to GIF recorder _(MIT Licensed)_

---
### Introduction

I needed to record canvas demo animations for my [pXY.js](https://github.com/leeoniya/pXY.js) framework's [docs](http://o-0.me/pXY/). The requirements were: tiny filesize&#42;, pixel-perfect upscaling, layer alpha-composition, loop and frame control. After trying and discarding many screen recorders, lossless codecs, compressors and permutations of settings, I decided to write this framework. It should also work very well for pixel-art sprites, animations and graphics. It is **NOT** designed to encode photos, very large images or ones with heavy use of gradients.

There are some restrictions _for now_:

  - Only a global 256-color palette is used, if your frames (combined) have more colors, shit will break.
  - Per-frame options are not implemented yet, though they are supported by the omggif encoder.
  - Framerate is limited to 50fps. This is a browser vendor decision. 20ms is the smallest possible frame delay.
  - Probably other stuff...

Fresh HTML5/JS features are used, so **use Chrome or Firefox** - Canvas, Typed Arrays, Array.forEach, Webworkers (soon).

&#42; If you need absolute smallest filesize, compress the resulting GIFs with [gifsicle](https://github.com/kohler/gifsicle).

---
### Features

To come...

---
### Useage

See `/tests` directory until docs are ready.

---
### Dependencies

  - [omggif](https://github.com/deanm/omggif) - awesome GIF89a encoder
  - [base64ArrayBuffer](https://gist.github.com/jonleighton/958841) - base64 encoder

*included in `/lib`*