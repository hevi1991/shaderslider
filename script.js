import anime from "animejs";
import * as THREE from "three";

class ShaderSlider {
    constructor(opts) {
        this.vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `;

        this.fragmentShader = `
    
    varying vec2 vUv;

    uniform sampler2D currentImage;
    uniform sampler2D nextImage;

    uniform float dispFactor;
    uniform float intensity;

    void main() {

        vec2 uv = vUv;
        vec4 _currentImage;
        vec4 _nextImage;

        vec4 orig1 = texture2D(currentImage, uv);
        vec4 orig2 = texture2D(nextImage, uv);
        
        _currentImage = texture2D(currentImage, vec2(uv.x, uv.y + dispFactor * (orig2 * intensity)));

        _nextImage = texture2D(nextImage, vec2(uv.x, uv.y + (1.0 - dispFactor) * (orig1 * intensity)));

        vec4 finalTexture = mix(_currentImage, _nextImage, dispFactor);

        gl_FragColor = finalTexture;

    }
  `;

        this.urls = opts.urls || [];
        if (this.urls.length === 0) {
            console.error("Image url is empty.");
            return;
        }
        this.parent = opts.parent;
        if (!this.parent) {
            console.error(`Parent dom is ${this.parent}.`);
            return;
        }
        this.auto = opts.auto || false;
        this.autoInterval = 5000;
        this.autoTimerId;

        this.images = this.sliderImages = [];

        this.sizes = {
            width: this.parent.clientWidth,
            height: this.parent.clientHeight,
        };

        this.clock = new THREE.Clock();

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0xff0000, 1.0);
        this.renderer.setSize(this.sizes.width, this.sizes.height, false);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.parent.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.OrthographicCamera(this.sizes.width / -2, this.sizes.width / 2, this.sizes.height / 2, this.sizes.height / -2);
        this.camera.position.z = 100;

        this.loadResources().then(() => {
            this.setSizes();

            this.currentImageIndex = 0;
            this.currentImage = this.sliderImages[this.currentImageIndex];
            this.nextImageIndex = (this.currentImageIndex + 1) % this.sliderImages.length;
            this.nextImage = this.sliderImages[this.nextImageIndex];
            this.addObjects();

            const { fitWidth, fitHeight } = this.images[this.currentImageIndex];
            this.mesh.scale.set(fitWidth, fitHeight, 1.0);

            this.isAnimating = false;

            this.setupEvents();
            this.setupResize();

            if (this.auto) {
                this.play();
            }
        });
        this.render();
    }

    loadResources() {
        this.loadingManager = new THREE.LoadingManager();
        this.loader = new THREE.TextureLoader(this.loadingManager);
        this.loader.crossOrigin = "anonymous";

        this.loaderGroup = new THREE.Group();
        const material = new THREE.MeshBasicMaterial();
        for (let i = -1; i < 2; i++) {
            const radius = 10;
            const geometry = new THREE.CircleBufferGeometry(radius, 32);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(radius * i + i * 20, 0, 0);
            this.loaderGroup.add(mesh);
        }
        const targets = this.loaderGroup.children.map((mesh) => mesh.position);
        anime({
            targets: targets,
            y: 30,
            delay: anime.stagger(100),
            loop: true,
            easing: "easeOutBack",
            direction: "alternate",
        });
        this.scene.add(this.loaderGroup);

        // loader
        return new Promise((resolve, reject) => {
            this.loadingManager.onProgress = (_, current, total) => {
                // console.log(`loading progressing ${current} / ${total}`);
            };
            this.loadingManager.onError = () => {
                console.error("Loading error");
                reject();
            };
            this.loadingManager.onLoad = () => {
                this.parent.classList.remove("loading");
                console.log("Resouces loaded");
                this.images = this.sliderImages.map((imageTexture) => imageTexture.image);

                // dispose loader
                anime.remove(targets);
                this.scene.remove(this.loaderGroup);
                material.dispose();
                this.loaderGroup.children.forEach((mesh) => {
                    mesh.geometry.dispose();
                });
                resolve();
            };

            // start loading
            this.urls.forEach((img) => {
                let imageTexture = this.loader.load(img);
                imageTexture.encoding = THREE.sRGBEncoding;
                imageTexture.magFilter = imageTexture.minFilter = THREE.LinearFilter;
                imageTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                this.sliderImages.push(imageTexture);
            });
        });
    }

    addObjects() {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                intensity: { value: 0.3 },
                dispFactor: { type: "f", value: 0.0 },
                currentImage: { type: "t", value: this.currentImage },
                nextImage: { type: "t", value: this.nextImage },
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            transparent: true,
            opacity: 1.0,
        });

        this.geometry = new THREE.PlaneBufferGeometry(1, 1, 32, 32);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.set(0, 0, 0);
        this.scene.add(this.mesh);
    }

    setupEvents() {
        const pagination = document.createElement("div");
        pagination.id = "pagination";
        this.pagButtons = this.images.map((_, idx) => {
            const button = document.createElement("button");
            if (idx === 0) {
                button.classList.add("active");
            }
            button.setAttribute("data-slide", idx);
            pagination.appendChild(button);
            return button;
        });
        this.parent.appendChild(pagination);

        // set Click Events
        this.pagButtons.forEach((el) => {
            el.addEventListener("click", () => {
                if (this.auto) {
                    this.pause();
                    this.play();
                }
                this.pageChange(el);
            });
        });
    }

    pageChange(el) {
        if (!this.isAnimating) {
            this.isAnimating = true;

            this.pagButtons[this.currentImageIndex].classList.remove("active");

            el.classList.add("active");

            let slideId = parseInt(el.dataset.slide, 10);

            this.material.uniforms.nextImage.value = this.sliderImages[slideId];

            // scale
            const { fitWidth, fitHeight } = this.images[slideId];

            anime({
                targets: this.mesh.scale,
                x: fitWidth,
                y: fitHeight,
                easing: "easeInOutSine",
                changeComplete: () => {
                    this.currentImageIndex = slideId;
                    this.currentImage = this.sliderImages[slideId];
                    this.nextImageIndex = (this.currentImageIndex + 1) % this.sliderImages.length;
                    this.nextImage = this.sliderImages[this.nextImageIndex];
                },
            });

            anime({
                targets: this.material.uniforms.dispFactor,
                value: 1,
                easing: "easeInOutSine",
                changeComplete: () => {
                    this.material.uniforms.currentImage.value = this.sliderImages[slideId];
                    this.material.uniforms.dispFactor.value = 0.0;
                    this.isAnimating = false;
                },
            });
        }
    }

    play() {
        this.auto = true;
        if (this.autoTimerId) {
            window.clearInterval(this.autoInterval);
        }
        this.autoTimerId = window.setInterval(() => {
            if (this.auto) {
                this.pageChange(this.pagButtons[this.nextImageIndex]);
            } else {
                this.stop();
            }
        }, this.autoInterval);
    }

    pause() {
        if (this.auto && this.autoTimerId) {
            window.clearInterval(this.autoTimerId);
        }
    }

    stop() {
        this.auto = false;
        window.clearInterval(this.autoTimerId);
    }

    setSizes() {
        this.sizes.width = this.parent.clientWidth;
        this.sizes.height = this.parent.clientHeight;

        this.images.forEach((image) => {
            const { width, height } = this.sizes;
            const { naturalWidth, naturalHeight } = image;
            let fitWidth,
                fitHeight = 0;

            const widthTimes = naturalWidth / width;
            const heightTimes = naturalHeight / height;

            if (widthTimes > heightTimes) {
                fitWidth = width * (widthTimes / heightTimes);
                fitHeight = height;
            } else {
                fitWidth = width;
                fitHeight = height * (heightTimes / widthTimes);
            }

            image.fitWidth = fitWidth;
            image.fitHeight = fitHeight;
        });

        console.log(1);
        if (this.loaderMesh) {
            console.log(1);
            this.loaderMaterial.uniforms.resolution.value.x = this.sizes.width;
            this.loaderMaterial.uniforms.resolution.value.y = this.sizes.height;
        }
    }

    setupResize() {
        window.addEventListener(
            "resize",
            this.debounce(() => {
                this.setSizes();
                const { fitWidth, fitHeight } = this.images[this.currentImageIndex];
                this.mesh.scale.set(fitWidth, fitHeight);

                this.camera.left = this.sizes.width / -2;
                this.camera.right = this.sizes.width / 2;
                this.camera.top = this.sizes.height / 2;
                this.camera.bottom = this.sizes.height / -2;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(this.sizes.width, this.sizes.height, false);
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            }, 300)
        );
    }

    render() {
        this.renderer.render(this.scene, this.camera);
        window.requestAnimationFrame(this.render.bind(this));
    }

    debounce(fn, wait) {
        let timer = null;
        return function () {
            let context = this;
            let args = arguments;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            timer = setTimeout(function () {
                fn.apply(context, args);
            }, wait);
        };
    }
}

const el = document.getElementById("slider");
const urls = Array.from(el.querySelectorAll("input")).map((i) => i.value);
new ShaderSlider({
    parent: el,
    urls: urls,
    auto: true,
});
