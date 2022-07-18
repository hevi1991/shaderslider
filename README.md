# shaderslider

## Table of Contents

- [About](#about)
- [Getting Started](#getting_started)
- [Usage](#usage)

## About <a name = "about"></a>
A slider that using shader.

Shader from [https://codepen.io/ashthornton/pen/KRQbMO](https://codepen.io/ashthornton/pen/KRQbMO).

This project power by threejs and animejs.

## Getting Started <a name = "getting_started"></a>

```
import ShaderSlider from "./index";

const el = document.getElementById("slider");

const urls = Array.from(el.querySelectorAll("input")).map((i) => i.value);

new ShaderSlider({
    parent: el,
    urls: urls,
    auto: true,
});

```

### Installing

```
git clone <this repo>

cd <this repo>

npm install

npm run dev
```