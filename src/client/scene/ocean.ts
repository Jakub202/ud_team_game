import * as THREE from 'three';

// [dirX, dirZ, frequency, speed, amplitude]
const WAVES: [number, number, number, number, number][] = [
  [1.0, 0.3, 0.08, 1.1, 0.55],
  [-0.4, 1.0, 0.13, 1.4, 0.32],
  [0.7, -0.6, 0.21, 1.9, 0.16],
  [0.2, 0.9, 0.37, 2.5, 0.07],
].map(([x, z, f, s, a]) => {
  const l = Math.hypot(x, z);
  return [x / l, z / l, f, s, a];
});

/** Same wave function as the shader, so the ship can ride the waves. */
export function waveHeight(x: number, z: number, t: number, amp: number, offset: number): number {
  const pz = z - offset;
  let hgt = 0;
  for (const [dx, dz, f, sp, a] of WAVES) hgt += a * Math.sin((x * dx + pz * dz) * f + t * sp);
  return hgt * amp;
}

const glslWaves = WAVES.map(
  ([dx, dz, f, sp, a]) => `h += ${a.toFixed(3)} * sin(dot(p, vec2(${dx.toFixed(4)}, ${dz.toFixed(4)})) * ${f.toFixed(3)} + uTime * ${sp.toFixed(3)});`,
).join('\n');

export interface OceanUniforms {
  uTime: { value: number };
  uAmp: { value: number };
  uOffset: { value: number };
  uDeep: { value: THREE.Color };
  uShallow: { value: THREE.Color };
  uFoam: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uFogColor: { value: THREE.Color };
  uFogDensity: { value: number };
  uCamPos: { value: THREE.Vector3 };
  uLight: { value: number };
}

export const OCEAN_CELL = 700 / 220;

export function createOcean(): { mesh: THREE.Mesh; uniforms: OceanUniforms } {
  const geo = new THREE.PlaneGeometry(700, 700, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const uniforms: OceanUniforms = {
    uTime: { value: 0 },
    uAmp: { value: 1 },
    uOffset: { value: 0 },
    uDeep: { value: new THREE.Color('#1d4e6e') },
    uShallow: { value: new THREE.Color('#3f93a8') },
    uFoam: { value: new THREE.Color('#e8f4f4') },
    uSunDir: { value: new THREE.Vector3(0.5, 0.6, -0.4).normalize() },
    uFogColor: { value: new THREE.Color('#f2d4a6') },
    uFogDensity: { value: 0.006 },
    uCamPos: { value: new THREE.Vector3() },
    uLight: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as any,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uAmp;
      uniform float uOffset;
      varying vec3 vWorld;
      varying float vH;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec2 p = vec2(world.x, world.z - uOffset);
        float h = 0.0;
        ${glslWaves}
        h *= uAmp;
        world.y += h;
        vH = h;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform vec3 uCamPos;
      uniform float uLight;
      uniform float uAmp;
      varying vec3 vWorld;
      varying float vH;
      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (n.y < 0.0) n = -n;
        vec3 sun = normalize(uSunDir);
        float diff = clamp(dot(n, sun), 0.0, 1.0);
        float k = smoothstep(-0.9 * uAmp, 1.1 * uAmp, vH);
        vec3 col = mix(uDeep, uShallow, k);
        col *= 0.55 + 0.6 * diff;
        vec3 v = normalize(uCamPos - vWorld);
        vec3 hv = normalize(v + sun);
        col += pow(max(dot(n, hv), 0.0), 70.0) * 0.35 * uLight;
        col = mix(col, uFoam, smoothstep(0.75 * uAmp, 1.15 * uAmp, vH) * 0.55);
        col *= uLight;
        float d = length(uCamPos - vWorld);
        float fog = 1.0 - exp(-pow(uFogDensity * d, 2.0));
        col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export interface SkyUniforms {
  uTop: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSun: { value: number };
  uFlash: { value: number };
}

export function createSky(): { mesh: THREE.Mesh; uniforms: SkyUniforms } {
  const uniforms: SkyUniforms = {
    uTop: { value: new THREE.Color('#3d6fa8') },
    uHorizon: { value: new THREE.Color('#f2d4a6') },
    uSunDir: { value: new THREE.Vector3(0.5, 0.25, -0.8).normalize() },
    uSun: { value: 1 },
    uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as any,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform float uSun;
      uniform float uFlash;
      varying vec3 vDir;
      void main() {
        float y = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(y, 0.55));
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.25) * uSun;
        col = mix(col, vec3(0.92, 0.95, 1.0), uFlash);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}
