import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CarState } from "../shared/types";

/** A batched, soft tire wake instead of flat rectangles sliding along the road. */
export function TireCloud({ car, rain }: { car: CarState; rain: boolean }) {
  const count = 12;
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const inverse = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute(
      "age",
      new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
    );
    return plane;
  }, []);
  const uniforms = useMemo(
    () => ({
      density: { value: 0 },
      tint: { value: new THREE.Color("#dce5e4") },
    }),
    [],
  );
  const color = useMemo(
    () => new THREE.Color(car.surface === "grass" ? "#baa07d" : "#dce5e4"),
    [car.surface],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ camera, clock }) => {
    if (!mesh.current || !group.current) return;
    const active =
      !car.crashed &&
      !car.dnf &&
      !car.finished &&
      car.speed > 3 &&
      (car.surface === "grass" || rain);
    group.current.visible = active;
    if (!active) return;
    group.current.position.set(car.x, car.y + 0.14, car.z);
    group.current.rotation.y = car.heading;
    uniforms.density.value =
      Math.min(1, car.speed / 20) * (car.surface === "grass" ? 0.16 : 0.11);
    uniforms.tint.value.copy(color);
    inverse.setFromAxisAngle(up, -car.heading);
    const ages = geometry.getAttribute("age") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < count; i++) {
      const age = (clock.elapsedTime * 1.8 + i / 6) % 1;
      dummy.position.set(
        (i % 2 ? 1 : -1) * 0.72 + Math.sin(i * 7.3) * age * 0.55,
        0.2 + age * 0.65,
        -1.4 - age * (2 + car.speed * 0.13),
      );
      dummy.quaternion.copy(inverse).multiply(camera.quaternion);
      dummy.scale.setScalar(0.3 + age * 1.2);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
      ages.setX(i, age);
    }
    ages.needsUpdate = true;
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={group} visible={false}>
      <instancedMesh
        ref={mesh}
        args={[geometry, undefined, count]}
        frustumCulled={false}
      >
        <shaderMaterial
          uniforms={uniforms}
          transparent
          depthWrite={false}
          vertexShader={`attribute float age; varying vec2 vUv; varying float vAge; varying float vDistance;
          void main(){vUv=uv;vAge=age;vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);vDistance=length(world.xyz-cameraPosition);gl_Position=projectionMatrix*viewMatrix*world;}`}
          fragmentShader={`uniform float density;uniform vec3 tint;varying vec2 vUv;varying float vAge;varying float vDistance;
          void main(){float soft=1.0-smoothstep(0.1,0.5,length(vUv-0.5));float alpha=soft*soft*sin(vAge*3.14159)*density*(1.0-smoothstep(40.0,90.0,vDistance));gl_FragColor=vec4(tint,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`}
        />
      </instancedMesh>
    </group>
  );
}
