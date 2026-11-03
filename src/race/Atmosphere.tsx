import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CarState, TrackDef, TrackId } from "../shared/types";
import { sampleTrack, trackMetrics } from "../shared/tracks";

const PALETTES: Record<
  TrackId,
  { sky: string; horizon: string; sun: string; fog: string; ground: string }
> = {
  sakura: {
    sky: "#367eae",
    horizon: "#f9d8bc",
    sun: "#ffe2ad",
    fog: "#d7cbbd",
    ground: "#657b49",
  },
  alpine: {
    sky: "#388ab6",
    horizon: "#d8e8e5",
    sun: "#fff1d1",
    fog: "#b5ccd1",
    ground: "#526e52",
  },
  passage: {
    sky: "#5d9cb0",
    horizon: "#dde1ca",
    sun: "#ffe4b3",
    fog: "#a4bdba",
    ground: "#405d51",
  },
  fjord: {
    sky: "#5d9cb0",
    horizon: "#dde1ca",
    sun: "#ffe4b3",
    fog: "#a4bdba",
    ground: "#405d51",
  },
  causeway: {
    sky: "#379dc5",
    horizon: "#ffe6ca",
    sun: "#fff0bf",
    fog: "#c5ded8",
    ground: "#6e8556",
  },
  cloudline: {
    sky: "#4775a2",
    horizon: "#d9e1eb",
    sun: "#ffe9d0",
    fog: "#b8c6d5",
    ground: "#596769",
  },
};

export function racePalette(trackId: TrackId, rain: boolean) {
  return rain
    ? {
        sky: "#687e90",
        horizon: "#bdc6c8",
        sun: "#e6e4d6",
        fog: "#a0b0b5",
        ground: "#43594e",
      }
    : PALETTES[trackId];
}

const skyVertex = `varying vec3 vDirection;
void main() {
  vDirection = position;
  vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = pos.xyww;
}`;
const skyFragment = `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunlight; uniform float wet; uniform float mountains; uniform vec3 ridgeTint;
varying vec3 vDirection;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void main() {
  vec3 d = normalize(vDirection);
  float h = max(d.y, 0.0);
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.72, h));
  vec3 sunDir = normalize(vec3(-0.65, 0.32, -0.55));
  float sun = max(0.0, dot(d, sunDir));
  col += sunlight * pow(sun, 12.0) * (0.14 - wet*0.1);
  col = mix(col, sunlight, smoothstep(0.9990, 0.9998, sun) * (1.0-wet));
  vec2 uv = d.xz / max(0.18, d.y + 0.18) * 2.4;
  float n = noise(uv)*0.58 + noise(uv*2.1)*0.28 + noise(uv*4.2)*0.14;
  float cloud = smoothstep(0.63-wet*0.23, 0.84, n) * smoothstep(0.02,0.16,h) * (1.0-smoothstep(0.65,0.95,h));
  col = mix(col, mix(sunlight, vec3(0.62,0.68,0.72),wet), cloud * (0.38+wet*0.42));
  float azimuth=(atan(d.x,d.z)+3.14159265)/6.2831853;
  float ridgeA=(0.035+abs(sin(azimuth*18.8496))*0.035+abs(sin(azimuth*43.9823))*0.018)*mountains;
  float ridgeB=(0.012+abs(sin(azimuth*31.4159+0.8))*0.033+abs(sin(azimuth*69.1150))*0.012)*mountains;
  if(d.y>0.0&&d.y<ridgeA)col=mix(horizon,ridgeTint,0.23+wet*0.03);
  if(d.y>0.0&&d.y<ridgeB)col=mix(horizon,ridgeTint,0.38+wet*0.04);
  gl_FragColor=vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** One inexpensive sky draw; follows the eye so long circuits never leave the sky. */
export function MotorsportSky({
  trackId,
  rain,
  wetness,
}: {
  trackId: TrackId;
  rain: boolean;
  wetness?: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const palette = racePalette(trackId, rain);
  const wet = wetness ?? (rain ? 1 : 0);
  const targets = useMemo(
    () => ({
      sky: new THREE.Color(PALETTES[trackId].sky).lerp(
        new THREE.Color(racePalette(trackId, true).sky),
        wet,
      ),
      horizon: new THREE.Color(PALETTES[trackId].horizon).lerp(
        new THREE.Color(racePalette(trackId, true).horizon),
        wet,
      ),
      sun: new THREE.Color(PALETTES[trackId].sun).lerp(
        new THREE.Color(racePalette(trackId, true).sun),
        wet,
      ),
    }),
    [trackId, wet],
  );
  const uniforms = useMemo(
    () => ({
      zenith: { value: new THREE.Color(palette.sky) },
      horizon: { value: new THREE.Color(palette.horizon) },
      sunlight: { value: new THREE.Color(palette.sun) },
      wet: { value: rain ? 1 : 0 },
      mountains: { value: trackId === "causeway" ? 0.08 : trackId === "sakura" ? 0.6 : trackId === "cloudline" ? 1.5 : 1.25 },
      ridgeTint: { value: new THREE.Color(PALETTES[trackId].ground) },
    }),
    [trackId],
  );
  useFrame(({ camera }, delta) => {
    mesh.current?.position.copy(camera.position);
    const amount = 1 - Math.exp(-3 * delta);
    uniforms.zenith.value.lerp(targets.sky, amount);
    uniforms.horizon.value.lerp(targets.horizon, amount);
    uniforms.sunlight.value.lerp(targets.sun, amount);
    uniforms.wet.value = THREE.MathUtils.lerp(uniforms.wet.value, wet, amount);
  });
  return (
    <mesh ref={mesh} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
      <shaderMaterial
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

export function MotorsportLight({
  trackId,
  rain,
  wetness,
  shadows,
}: {
  trackId: TrackId;
  rain: boolean;
  wetness?: number;
  shadows: boolean;
}) {
  const light = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  const target = useMemo(() => new THREE.Object3D(), []);
  const palette = racePalette(trackId, rain);
  const wet = wetness ?? (rain ? 1 : 0);
  const initialIntensity = useRef(2.5 - wet * 1.4).current;
  const sunColor = useMemo(
    () =>
      new THREE.Color(PALETTES[trackId].sun).lerp(
        new THREE.Color(racePalette(trackId, true).sun),
        wet,
      ),
    [trackId, wet],
  );
  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);
  useFrame(({ camera }, delta) => {
    if (!light.current) return;
    const response = 1 - Math.exp(-3 * delta);
    light.current.intensity = THREE.MathUtils.lerp(
      light.current.intensity,
      2.5 - wet * 1.4,
      response,
    );
    light.current.color.lerp(sunColor, response);
    // Shadow coverage travels with the driver, including on elevated routes.
    target.position.set(
      Math.round(camera.position.x / 4) * 4,
      camera.position.y - 1,
      Math.round(camera.position.z / 4) * 4,
    );
    light.current.position.set(
      target.position.x - 38,
      target.position.y + 55,
      target.position.z - 32,
    );
    light.current.target = target;
  });
  return (
    <>
      <ambientLight intensity={rain ? 0.36 : 0.24} />
      <hemisphereLight
        args={[
          rain ? "#d3e0e7" : "#e5f0fc",
          palette.ground,
          rain ? 1.05 : 0.85,
        ]}
      />
      <directionalLight
        ref={light}
        position={[-38, 55, -32]}
        color={palette.sun}
        intensity={initialIntensity}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
        shadow-radius={3}
      />
    </>
  );
}

// World-space grain keeps road detail aligned through curves and changes of elevation.
export function AsphaltMaterial({
  rain,
  wetness,
}: {
  rain: boolean;
  wetness?: number;
}) {
  const wet = wetness ?? (rain ? 1 : 0);
  const color = useMemo(
    () => new THREE.Color("#53565a").lerp(new THREE.Color("#354148"), wet),
    [wet],
  );
  const wetUniform = useRef<THREE.IUniform<number> | null>(null);
  useEffect(() => {
    if (wetUniform.current) wetUniform.current.value = wet;
  }, [wet]);
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.92 - wet * 0.62}
      metalness={0.015 + wet * 0.105}
      side={THREE.DoubleSide}
      onBeforeCompile={(shader) => {
        shader.uniforms.roadWetness = { value: wet };
        wetUniform.current = shader.uniforms.roadWetness;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vRoadWorld;",
          )
          .replace(
            "#include <worldpos_vertex>",
            "#include <worldpos_vertex>\nvRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying vec3 vRoadWorld; uniform float roadWetness;
        float roadHash(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
        float roadNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(roadHash(i),roadHash(i+vec2(1,0)),f.x),mix(roadHash(i+vec2(0,1)),roadHash(i+vec2(1,1)),f.x),f.y); }`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>\nfloat grain = roadNoise(vRoadWorld.xz*48.0); float wear=roadNoise(vRoadWorld.xz*0.28); diffuseColor.rgb *= 0.82+grain*0.22+wear*0.12;`,
          )
          .replace(
            "#include <opaque_fragment>",
            `vec3 roadView=normalize(cameraPosition-vRoadWorld);float sheen=pow(1.0-abs(roadView.y),4.0)*roadWetness*(0.12+smoothstep(0.4,0.7,wear)*0.2);outgoingLight=mix(outgoingLight,vec3(0.32,0.40,0.44),sheen);
#include <opaque_fragment>`,
          );
      }}
      customProgramCacheKey={() => "motorsport-asphalt-v2"}
    />
  );
}

/** Low-cost, terrain-aware grounding also works when split-screen disables real shadows. */
export function CarGroundShadows({ cars }: { cars: CarState[] }) {
  return (
    <group>
      {cars
        .filter((c) => !c.dnf)
        .map((car) => (
          <group
            key={car.playerId}
            position={[car.x, car.y + 0.105, car.z]}
            rotation={[0, car.heading, 0]}
          >
            <mesh
              rotation={[-Math.PI / 2 - Math.atan(car.roadGrade ?? 0), 0, 0]}
              scale={[
                car.vehicleId === "stockTruck" ? 1.3 : 1.05,
                car.vehicleId === "formula" ? 2 : 1.5,
                1,
              ]}
            >
              <planeGeometry args={[2, 2]} />
              <shaderMaterial
                transparent
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-1}
                vertexShader={`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
                fragmentShader={`varying vec2 vUv;void main(){float a=1.0-smoothstep(0.15,0.5,length(vUv-0.5));gl_FragColor=vec4(0.04,0.06,0.07,a*0.32);}`}
              />
            </mesh>
          </group>
        ))}
    </group>
  );
}

/** One draw call for the whole shower, with time-based motion on every refresh rate. */
export function RainStreaks({
  focus,
  count,
  wetness = 1,
}: {
  focus: CarState;
  count: number;
  wetness?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const instances = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }, delta) => {
    if (!group.current || !instances.current) return;
    group.current.position.set(focus.x, focus.y, focus.z);
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const speed = 17 + (i % 11);
      dummy.position.set(
        ((i * 37) % 62) - 31 + Math.sin(t * 0.1) * 1.2,
        33 - ((t * speed + i * 19) % 33),
        ((i * 53) % 70) - 25 + Math.sin(focus.heading) * 10,
      );
      dummy.rotation.set(0.16, 0, -0.12);
      dummy.scale.set(1, 0.7 + (i % 4) * 0.25, 1);
      dummy.updateMatrix();
      instances.current.setMatrixAt(i, dummy.matrix);
    }
    instances.current.instanceMatrix.needsUpdate = delta > 0;
  });
  return (
    <group ref={group}>
      <instancedMesh
        ref={instances}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.018, 0.7, 0.018]} />
        <meshBasicMaterial
          color="#e5f2fa"
          transparent
          opacity={0.46 * wetness}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

export function SakuraPetals({
  focus,
  count = 60,
}: {
  focus: CarState;
  count?: number;
}) {
  const instances = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!instances.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        focus.x + ((i * 17.3 + t * 1.4) % 56) - 28,
        focus.y + 12 - ((i * 2.3 + t * 0.65) % 12),
        focus.z + ((i * 29.7 + t * 0.9) % 56) - 28,
      );
      dummy.rotation.set(t * 0.8 + i, t * 0.4 + i * 3, Math.sin(t + i));
      dummy.scale.setScalar(0.65 + (i % 4) * 0.2);
      dummy.updateMatrix();
      instances.current.setMatrixAt(i, dummy.matrix);
    }
    instances.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={instances}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <circleGeometry args={[0.065, 5]} />
      <meshStandardMaterial
        color="#ffcbd4"
        emissive="#924756"
        emissiveIntensity={0.12}
        roughness={0.9}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

/** Distant silhouettes compose the small Sakura circuit without occupying its runoff. */
export function SakuraLandscape({
  track,
  rain,
}: {
  track: TrackDef;
  rain: boolean;
}) {
  const hills = useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const angle = (i / 13) * Math.PI * 2;
        return {
          x: 20 + Math.sin(angle) * 220,
          z: 30 + Math.cos(angle) * 200,
          h: 28 + ((i * 17) % 34),
          radius: 55 + ((i * 23) % 35),
          color: i % 3 === 0 ? "#788f87" : i % 3 === 1 ? "#8ca399" : "#6c8b83",
        };
      }),
    [],
  );
  const groves = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const p = sampleTrack(
          track,
          (trackMetrics(track).totalLength * i) / 40,
        );
        const side = i % 2 === 0 ? 1 : -1;
        const offset =
          track.width / 2 +
          track.curbWidth +
          track.wallMargin +
          9 +
          ((i * 7) % 11);
        return {
          x: p.x + Math.cos(p.heading) * offset * side,
          z: p.z - Math.sin(p.heading) * offset * side,
          y: p.y,
          scale: 0.8 + (i % 5) * 0.12,
        };
      }).filter((p) => {
        // A compact loop can place the far side of a bend close to this grove.
        return !trackMetrics(track).samples.some(
          (s) =>
            Math.hypot(p.x - s.x, p.z - s.z) <
            track.width / 2 + track.curbWidth + track.wallMargin + 3,
        );
      }),
    [track],
  );
  return (
    <group>
      {hills.map((h, i) => (
        <mesh
          key={i}
          position={[h.x, -5, h.z]}
          scale={[h.radius, h.h, h.radius * 0.72]}
          rotation={[0, i * 0.7, 0]}
        >
          <sphereGeometry args={[1, 14, 7]} />
          <meshStandardMaterial
            color={rain ? "#687c78" : h.color}
            roughness={1}
            flatShading
          />
        </mesh>
      ))}
      {groves.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} scale={p.scale}>
          <mesh position={[0, 2.4, 0]}>
            <cylinderGeometry args={[0.16, 0.27, 4.8, 6]} />
            <meshStandardMaterial color="#584b43" roughness={1} />
          </mesh>
          {[-1, 0, 1].map((side, j) => (
            <mesh
              key={j}
              position={[
                side * 1.25,
                4.9 + Math.cos(j * 2) * 0.4,
                (j % 2) * 0.6,
              ]}
              scale={[2.5, 1.65, 2.1]}
              rotation={[0, i * 0.8 + j, 0]}
            >
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial
                color={rain ? "#ba929f" : j === 1 ? "#f3c3c4" : "#dc9fae"}
                roughness={1}
                flatShading
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function LandscapeMaterial({ color }: { color: string }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={1}
      side={THREE.DoubleSide}
      onBeforeCompile={(shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vLand;",
          )
          .replace(
            "#include <worldpos_vertex>",
            "#include <worldpos_vertex>\nvLand=(modelMatrix*vec4(transformed,1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vLand;",
          )
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\nfloat variation=sin(vLand.x*0.13+sin(vLand.z*0.09)*2.0)*sin(vLand.z*0.17)+sin(vLand.x*1.7+vLand.z*2.3)*0.15;diffuseColor.rgb*=0.92+variation*0.12;",
          );
      }}
      customProgramCacheKey={() => "motorsport-land-v1"}
    />
  );
}

export function RoadsideGrass({
  track,
  rain,
}: {
  track: TrackDef;
  rain: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -0.16, 0, 0, 0, 0.6, 0, 0.16, 0, 0, 0, 0, -0.14, 0, 0.45, 0, 0, 0,
          0.14,
        ],
        3,
      ),
    );
    g.computeVertexNormals();
    return g;
  }, []);
  const count = track.id === "sakura" ? 600 : track.id === "alpine" ? 750 : 900;
  useEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const length = trackMetrics(track).totalLength;
    for (let i = 0; i < count; i++) {
      const p = sampleTrack(track, (length * i) / count),
        side = i % 2 ? 1 : -1;
      const offset =
        track.width / 2 + track.curbWidth + 0.6 + ((i * 7.37) % 4.8);
      dummy.position.set(
        p.x + Math.cos(p.heading) * offset * side,
        p.y + 0.02,
        p.z - Math.sin(p.heading) * offset * side,
      );
      dummy.rotation.set(0, i * 2.4, 0);
      dummy.scale.setScalar(0.3 + ((i * 0.137) % 0.7));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [track, count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (track.id === "causeway" || track.id === "cloudline") return null;
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]}>
      <meshStandardMaterial
        color={rain ? "#718367" : "#9baf72"}
        side={THREE.DoubleSide}
        roughness={1}
      />
    </instancedMesh>
  );
}
