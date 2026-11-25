// 3D model conversion with three.js loaders/exporters (runs in the app window).
// Inputs: OBJ(+MTL), STL, PLY, GLB/GLTF, FBX, DAE, 3DS, 3MF, AMF, VTK/VTP, PCD, WRL, USDZ/USDA/USDC, LWO
// Outputs: GLB, GLTF, OBJ, STL, PLY, USDZ

import * as THREE from 'three';

const loaders = {
  obj: () => import('three/examples/jsm/loaders/OBJLoader.js').then(m => m.OBJLoader),
  mtl: () => import('three/examples/jsm/loaders/MTLLoader.js').then(m => m.MTLLoader),
  stl: () => import('three/examples/jsm/loaders/STLLoader.js').then(m => m.STLLoader),
  ply: () => import('three/examples/jsm/loaders/PLYLoader.js').then(m => m.PLYLoader),
  gltf: () => import('three/examples/jsm/loaders/GLTFLoader.js').then(m => m.GLTFLoader),
  fbx: () => import('three/examples/jsm/loaders/FBXLoader.js').then(m => m.FBXLoader),
  dae: () => import('three/examples/jsm/loaders/ColladaLoader.js').then(m => m.ColladaLoader),
  '3ds': () => import('three/examples/jsm/loaders/TDSLoader.js').then(m => m.TDSLoader),
  '3mf': () => import('three/examples/jsm/loaders/3MFLoader.js').then(m => m.ThreeMFLoader),
  amf: () => import('three/examples/jsm/loaders/AMFLoader.js').then(m => m.AMFLoader),
  vtk: () => import('three/examples/jsm/loaders/VTKLoader.js').then(m => m.VTKLoader),
  pcd: () => import('three/examples/jsm/loaders/PCDLoader.js').then(m => m.PCDLoader),
  wrl: () => import('three/examples/jsm/loaders/VRMLLoader.js').then(m => m.VRMLLoader),
  usd: () => import('three/examples/jsm/loaders/USDLoader.js').then(m => m.USDLoader),
  lwo: () => import('three/examples/jsm/loaders/LWOLoader.js').then(m => m.LWOLoader)
};

const textDecoder = new TextDecoder();

function asMesh(geometry, ext) {
  geometry.computeBoundingSphere();
  if (!geometry.getAttribute('normal') && geometry.getIndex() === null && ext !== 'pcd') geometry.computeVertexNormals();
  const hasColor = Boolean(geometry.getAttribute('color'));
  if (!geometry.index && geometry.getAttribute('position').count && !geometry.getAttribute('normal') && ext === 'pcd') {
    return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.01, vertexColors: hasColor }));
  }
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: hasColor ? 0xffffff : 0xb8b8c8, vertexColors: hasColor, roughness: 0.6, metalness: 0.05 }));
}

/** siblings: Map(lowercased file name → blob URL) for textures/MTL/BIN referenced by the model. */
async function loadModel(bytes, ext, siblings) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(data|blob):/.test(url)) return url;
    const name = decodeURIComponent(url.split(/[\\/]/).pop().split('?')[0]).toLowerCase();
    return siblings.get(name) || url;
  });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  switch (ext) {
    case 'obj': {
      const OBJLoader = await loaders.obj();
      const loader = new OBJLoader(manager);
      const text = textDecoder.decode(bytes);
      const mtlName = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim().toLowerCase();
      if (mtlName && siblings.has(mtlName)) {
        const MTLLoader = await loaders.mtl();
        const materials = await new MTLLoader(manager).loadAsync(siblings.get(mtlName));
        materials.preload();
        loader.setMaterials(materials);
      }
      return loader.parse(text);
    }
    case 'stl': return asMesh(new (await loaders.stl())(manager).parse(buffer), ext);
    case 'ply': return asMesh(new (await loaders.ply())(manager).parse(buffer), ext);
    case 'glb':
    case 'gltf': {
      const GLTFLoader = await loaders.gltf();
      const gltf = await new GLTFLoader(manager).parseAsync(ext === 'gltf' ? textDecoder.decode(bytes) : buffer, '');
      gltf.scene.animations = gltf.animations;
      return gltf.scene;
    }
    case 'fbx': return new (await loaders.fbx())(manager).parse(buffer, '');
    case 'dae': return (new (await loaders.dae())(manager).parse(textDecoder.decode(bytes), '')).scene;
    case '3ds': return new (await loaders['3ds']())(manager).parse(buffer, '');
    case '3mf': return new (await loaders['3mf']())(manager).parse(buffer);
    case 'amf': return new (await loaders.amf())(manager).parse(buffer);
    case 'vtk':
    case 'vtp': return asMesh(new (await loaders.vtk())(manager).parse(buffer, ''), ext);
    case 'pcd': return new (await loaders.pcd())(manager).parse(buffer);
    case 'wrl': return new (await loaders.wrl())(manager).parse(textDecoder.decode(bytes), '');
    case 'usda': return new (await loaders.usd())(manager).parse(textDecoder.decode(bytes));
    case 'usdz':
    case 'usdc': return new (await loaders.usd())(manager).parse(buffer);
    case 'lwo': return (new (await loaders.lwo())(manager).parse(buffer, '', '')).meshes?.reduce((group, mesh) => group.add(mesh) && group, new THREE.Group());
    default: throw new Error(`.${ext} models are not supported.`);
  }
}

/** Bakes transforms so exporters that ignore hierarchy (STL/PLY/OBJ) still produce correct geometry. */
function prepareScene(object, options) {
  const scene = new THREE.Scene();
  scene.add(object);
  object.updateMatrixWorld(true);
  const scale = Number(options.scale) || 1;
  if (scale !== 1) object.scale.multiplyScalar(scale);
  if (options.upAxis === 'z-to-y') object.rotation.x -= Math.PI / 2;
  if (options.upAxis === 'y-to-z') object.rotation.x += Math.PI / 2;
  if (options.center) {
    const box = new THREE.Box3().setFromObject(object);
    object.position.sub(box.getCenter(new THREE.Vector3()));
  }
  scene.updateMatrixWorld(true);
  let meshes = 0;
  scene.traverse(child => { if (child.isMesh || child.isPoints) meshes += 1; });
  if (!meshes) throw new Error('No geometry was found in this model.');
  return scene;
}

export async function convertModel(bytes, ext, target, options, siblings) {
  const object = await loadModel(bytes, ext, siblings);
  if (!object) throw new Error('The model could not be read.');
  const scene = prepareScene(object, options);
  switch (target) {
    case 'glb':
    case 'gltf': {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const result = await new GLTFExporter().parseAsync(scene, { binary: target === 'glb', embedImages: true, onlyVisible: true, animations: object.animations || [] });
      return target === 'glb' ? new Uint8Array(result) : new TextEncoder().encode(JSON.stringify(result));
    }
    case 'obj': {
      const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
      return new TextEncoder().encode(new OBJExporter().parse(scene));
    }
    case 'stl': {
      const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
      const binary = options.stlFormat !== 'ascii';
      const result = new STLExporter().parse(scene, { binary });
      return binary ? new Uint8Array(result.buffer, result.byteOffset, result.byteLength) : new TextEncoder().encode(result);
    }
    case 'ply': {
      const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js');
      const binary = options.stlFormat !== 'ascii';
      const result = await new Promise(resolve => new PLYExporter().parse(scene, resolve, { binary }));
      return binary ? new Uint8Array(result) : new TextEncoder().encode(result);
    }
    case 'usdz': {
      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
      return new Uint8Array(await new USDZExporter().parseAsync(scene, { quickLookCompatible: true }));
    }
    default:
      throw new Error(`Cannot export ${target.toUpperCase()}.`);
  }
}
