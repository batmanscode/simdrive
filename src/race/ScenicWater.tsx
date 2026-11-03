import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

/** A single surface draw: no reflection cameras, textures or extra render targets. */
export function ScenicWater({
  center,
  size,
  rain,
  coastal = false,
}: {
  center: [number, number, number];
  size: [number, number];
  rain: boolean;
  coastal?: boolean;
}) {
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)"),
    [],
  );
  const uniforms = useMemo(
    () => ({
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      waterTime: { value: 0 },
      waterColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      waterWet: { value: 0 },
    }),
    [],
  );
  // Scalar uniforms keep changes of weather inexpensive and leave the surface mounted.
  uniforms.waterColor.value.set(
    rain ? (coastal ? "#477d8a" : "#426878") : coastal ? "#269daf" : "#397b91",
  );
  uniforms.horizonColor.value.set(
    rain ? "#a1b7bd" : coastal ? "#c1e2dd" : "#b4d0cb",
  );
  uniforms.waterWet.value = rain ? 1 : 0;
  useFrame(({ clock }) => {
    uniforms.waterTime.value = reduced.matches ? 0 : clock.elapsedTime * 0.28;
  });
  return (
    <mesh position={center} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <shaderMaterial
        fog
        uniforms={uniforms}
        vertexShader={`
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vWaterWorld;
        void main(){
          vWaterWorld=(modelMatrix*vec4(position,1.0)).xyz;
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`}
        fragmentShader={`
        #include <common>
        #include <fog_pars_fragment>
        uniform float waterTime; uniform float waterWet;
        uniform vec3 waterColor; uniform vec3 horizonColor;
        varying vec3 vWaterWorld;
        void main(){
          vec2 p=vWaterWorld.xz;
          vec3 view=normalize(cameraPosition-vWaterWorld);
          float a=dot(p,vec2(.67,.21))+waterTime;
          float b=dot(p,vec2(-.16,.91))-waterTime*.73;
          // Suppress fine bands in the distance instead of letting them sparkle.
          float filterA=1.0-smoothstep(.3,1.6,fwidth(a));
          float filterB=1.0-smoothstep(.3,1.6,fwidth(b));
          float ripples=(sin(a)*filterA+sin(b)*filterB)*.5;
          vec3 normal=normalize(vec3(-cos(a)*.035*filterA,1.0,-cos(b)*.04*filterB));
          float fresnel=pow(1.0-max(0.0,dot(view,normal)),3.5);
          vec3 col=mix(waterColor*(.94+ripples*.055),horizonColor,fresnel*.56);
          vec3 halfDir=normalize(view+normalize(vec3(-.65,.65,-.55)));
          float glint=pow(max(0.0,dot(normal,halfDir)),120.0);
          col+=vec3(.34,.33,.24)*glint*(1.0-waterWet*.8);
          float crest=smoothstep(.90,.99,sin(a*.43+sin(b*.16)))*filterA;
          col=mix(col,horizonColor,crest*.09*(1.0-fresnel));
          gl_FragColor=vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`}
      />
    </mesh>
  );
}
