import { ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';

type Particle = {
  graphic: Graphics; born: number; life: number; x: number; y: number;
  vx: number; vy: number; gravity: number; grow: number; spin: number;
};
type Capture = {
  sprite: Sprite; filter: ColorMatrixFilter; impactAt: number;
  x: number; y: number; width: number; height: number; palette: number[];
};

/** Transient effects use board coordinates and never follow a moving piece. */
export class BoardEffects {
  readonly layer = new Container({ label: 'effects', eventMode: 'none' });
  private particles: Particle[] = [];
  private captures: Capture[] = [];
  private readonly limit = 240;

  get particleCount() { return this.particles.length; }
  get captureCount() { return this.captures.length; }

  capture(texture: Texture, x: number, y: number, width: number, height: number,
    impactAt: number, palette: number[]) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(.5, 1);
    sprite.position.set(x, y);
    sprite.width = width; sprite.height = height;
    const filter = new ColorMatrixFilter();
    sprite.filters = [filter];
    this.layer.addChild(sprite);
    this.captures.push({ sprite, filter, impactAt, x, y, width, height, palette });
  }

  dust(x: number, y: number, width: number, now: number) {
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const graphic = new Graphics().poly([-5,-2,-3,-2,-3,-5,2,-5,2,-3,5,-3,5,2,3,2,3,4,-3,4,-3,2,-5,2])
        .fill(i % 3 ? 0xf5edd5 : 0xfffcf0);
      this.add({ graphic, born: now, life: 240 + i * 18,
        x: x + side * width * (.25 + (i % 3) * .1), y: y + 2,
        vx: side * (45 + i * 6), vy: -12 - i * 3, gravity: -15, grow: 1.15, spin: 0 });
    }
  }

  private fragments(capture: Capture, now: number) {
    const { x, y, width, height, palette } = capture;
    for (let i = 0; i < 18; i++) {
      const size = 3 + Math.random() * 4;
      const graphic = new Graphics().rect(-size/2,-size/2,size,size).fill(palette[i % palette.length]);
      this.add({ graphic, born: now, life: 330 + Math.random() * 180,
        x: x + (Math.random()-.5)*width*.7, y: y - height*(.2+Math.random()*.65),
        vx: (Math.random()-.5)*190, vy: -35-Math.random()*100,
        gravity: 310, grow: -.55, spin: (Math.random()-.5)*5 });
    }
  }

  private add(particle: Particle) {
    if (this.particles.length >= this.limit) this.particles.shift()!.graphic.destroy();
    particle.graphic.position.set(particle.x, particle.y);
    this.layer.addChild(particle.graphic);
    this.particles.push(particle);
  }

  update(now: number, reducedMotion: boolean) {
    if (reducedMotion) { this.clear(); return; }
    for (let i = this.captures.length-1; i >= 0; i--) {
      const capture = this.captures[i];
      if (now >= capture.impactAt) {
        capture.sprite.destroy(); capture.filter.destroy();
        this.captures.splice(i, 1);
        // Do not emit stale bursts after returning to a backgrounded tab.
        if (now-capture.impactAt < 150) this.fragments(capture, capture.impactAt);
      } else if (now >= capture.impactAt-90) {
        // White silhouette while retaining source alpha, including scanline gaps.
        capture.filter.matrix = [0,0,0,0,1, 0,0,0,0,1, 0,0,0,0,1, 0,0,0,1,0];
      }
    }
    for (let i = this.particles.length-1; i >= 0; i--) {
      const particle = this.particles[i], age = now-particle.born, t = age/1000;
      if (age >= particle.life) { particle.graphic.destroy(); this.particles.splice(i,1); continue; }
      const progress = age/particle.life;
      particle.graphic.position.set(particle.x+particle.vx*t, particle.y+particle.vy*t+.5*particle.gravity*t*t);
      particle.graphic.scale.set(1+particle.grow*progress);
      particle.graphic.rotation = particle.spin*t;
      particle.graphic.alpha = Math.min(1,(1-progress)*1.5)*.85;
    }
  }

  clear() {
    for (const particle of this.particles) particle.graphic.destroy();
    for (const capture of this.captures) { capture.sprite.destroy(); capture.filter.destroy(); }
    this.particles = []; this.captures = [];
  }
}
