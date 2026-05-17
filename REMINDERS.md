Asset generation later

- Use generated or authored GLB assets, but do not drop raw AI output straight into the game.
- Clean assets in Blender first: decimate, scale, set origin, fix materials, then import with a GLTF loader.
- Good first assets: one Formula Prototype-style car GLB and a small prop pack.
- Good prop candidates: barriers, braking boards, trees, signs, trackside objects.
- Do not generate the whole track as one asset yet. Procedural track is better for physics alignment.
- Options to look at:
  - Replicate 3D models collection: https://replicate.com/collections/3d-models
  - Replicate Hunyuan 3D 3.1: https://replicate.com/tencent/hunyuan-3d-3.1
  - Meshy Text-to-3D API with GLB output: https://docs.meshy.ai/api/text-to-3d
  - Tripo-style GLB/PBR API: https://www.3daistudio.com/Platform/API/Documentation/3d-generation/tripo
