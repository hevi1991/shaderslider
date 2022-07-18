import ShaderSlider from "./index";

const el = document.getElementById("slider");
const urls = Array.from(el.querySelectorAll("input")).map((i) => i.value);
new ShaderSlider({
    parent: el,
    urls: urls,
    auto: true,
});
