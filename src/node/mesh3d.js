import {registerNode} from 'spritejs';
import {Program, Mesh, Geometry as _Geometry} from 'ogl';
import Geometry from '../helper/geometry';
import Group3d from './group3d';
import Mesh3dAttr from '../attribute/mesh3d';

const changedAttrs = Symbol.for('spritejs_changedAttrs');

const _program = Symbol('program');
const _geometry = Symbol('geometry');
const _model = Symbol('model');

const _beforeRender = Symbol('beforeRender');
const _afterRender = Symbol('afterRender');

function colorAttribute(node, geometry) {
  const updateColor = geometry.attributes.color;

  const positions = geometry.attributes.position.data;
  const len = positions.length / 3;

  const color = updateColor ? updateColor.data : new Float32Array(4 * len);
  const colors = node.attributes.colors;
  const colorLen = colors.length / 4;
  const colorDivisor = node.attributes.colorDivisor;

  for(let i = 0; i < len; i++) {
    // const color = colors
    const idx = Math.floor(i / colorDivisor) % colorLen;
    color[4 * i] = colors[idx * 4];
    color[4 * i + 1] = colors[idx * 4 + 1];
    color[4 * i + 2] = colors[idx * 4 + 2];
    color[4 * i + 3] = colors[idx * 4 + 3];
  }

  if(updateColor) updateColor.needsUpdate = true;

  return {size: 4, data: color};
}

function normalize(v) {
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len];
}

// 两个向量的叉积就是这个向量的法向量
function getNormal(a, b, c) {
  const ab = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const bc = [b[0] - c[0], b[1] - c[1], b[2] - c[2]];

  return normalize([
    ab[1] * bc[2] - ab[2] * bc[1],
    ab[0] * bc[2] - ab[2] * bc[0],
    ab[0] * bc[1] - ab[1] * bc[0],
  ]);
}

export default class Mesh3d extends Group3d {
  static Attr = Mesh3dAttr;

  constructor(program, {model, ...attrs} = {}) {
    if(program && !(program instanceof Program)) {
      attrs = program;
      program = attrs.program;
    }
    if(!program) {
      throw new Error('No program specified!');
    }

    super(attrs);
    this.groupBody = this.body;

    this.setProgram(program);

    this[_beforeRender] = (args) => {
      this.dispatchEvent({type: 'beforerender', detail: args});
    };
    this[_afterRender] = (args) => {
      this.dispatchEvent({type: 'afterrender', detail: args});
    };

    if(model && typeof model.then === 'function') {
      this[_model] = model.then((res) => {
        this[_model] = res;
        this.remesh();
      });
    } else if(!model) {
      this.remesh();
    } else {
      this.setGeometry(model);
    }
  }

  /* override */
  cloneNode(deep = false) {
    const attrs = this.attributes[changedAttrs];
    const cloned = new this.constructor(this[_program], {...attrs, model: this[_geometry]});
    if(deep) {
      this.children.forEach((child) => {
        const childNode = child.cloneNode(deep);
        cloned.appendChild(childNode);
      });
    }
    return cloned;
  }

  get model() {
    return this[_model];
  }

  get program() {
    return this[_program];
  }

  get geometry() {
    return this[_geometry];
  }

  get meshes() {
    const meshes = super.meshes;
    if(this.body.geometry) meshes.unshift(this.body);
    return meshes;
  }

  setProgram(program) {
    this[_program] = program;
    const gl = program.gl;

    program.extraAttribute = program.extraAttribute || {};
    if(program.attributeLocations.has('color') && !program.extraAttribute.color) {
      program.extraAttribute.color = colorAttribute;
    }

    const geometry = this[_geometry];
    if(geometry) {
      const mode = this.attributes.mode;
      const mesh = new Mesh(program.gl, {mode: gl[mode], geometry, program});
      this.setBody(mesh);
    }
  }

  setGeometry(model = this[_model]) {
    if(!model) return;
    const program = this[_program];
    const gl = program.gl;
    let geometry;
    if(model instanceof _Geometry) {
      geometry = model;
    } else {
      geometry = new Geometry(gl, model);
    }
    if(!geometry.attributes.normal && program.attributeLocations.has('normal')) {
      const position = geometry.attributes.position.data;
      const len = geometry.attributes.position.data.length;
      const normal = new Float32Array(len);
      if(len % 9 === 0) {
        // 自动计算法向量
        for(let i = 0; i < len; i += 9) {
          const a = [position[i], position[i + 1], position[i + 2]],
            b = [position[i + 3], position[i + 4], position[i + 5]],
            c = [position[i + 6], position[i + 7], position[i + 8]];

          const norm = getNormal(a, b, c);
          normal.set([...norm, ...norm, ...norm], i);
        }
      } else {
        for(let i = 0; i < len; i += 3) {
          normal.set([-1, 0, 0], i);
        }
      }
      geometry.addAttribute('normal', {size: 3, data: normal});
    }
    const extraAttrs = program.extraAttribute;
    if(extraAttrs) {
      Object.entries(extraAttrs).forEach(([key, setter]) => {
        if(!geometry.attributes[key]) {
          geometry.addAttribute(key, setter(this, geometry));
        }
      });
    }
    this[_geometry] = geometry;
    this[_model] = geometry.attributes;
    const mode = this.attributes.mode;
    const mesh = new Mesh(gl, {mode: gl[mode], geometry, program});
    this.setBody(mesh);
    let listeners = this.getListeners('beforerender');
    if(listeners.length) {
      mesh.onBeforeRender(this[_beforeRender]);
    }
    listeners = this.getListeners('afterrender');
    if(listeners.length) {
      mesh.onAfterRender(this[_afterRender]);
    }
  }

  /* override */
  addEventListener(type, listener, options = {}) {
    super.addEventListener(type, listener, options);
    if(this.body.onBeforeRender && type === 'beforerender') {
      const listeners = this.getListeners('beforerender');
      if(listeners.length === 1) {
        this.body.onBeforeRender(this[_beforeRender]);
      }
    } else if(this.body.onAfterRender && type === 'afterrender') {
      const listeners = this.getListeners('afterrender');
      if(listeners.length === 1) {
        this.body.onAfterRender(this[_afterRender]);
      }
    }
    return this;
  }

  /* override */
  removeAllListeners(type, options = {}) {
    super.removeAllListeners(type, options);
    if(this.body.onBeforeRender && type === 'beforerender') {
      const idx = this.body.beforeRenderCallbacks.indexOf(this[_beforeRender]);
      if(idx >= 0) this.body.beforeRenderCallbacks.splice(idx, 1);
    } else if(this.body.onAfterRender && type === 'afterrender') {
      const idx = this.body.afterRenderCallbacks.indexOf(this[_afterRender]);
      if(idx >= 0) this.body.afterRenderCallbacks.splice(idx, 1);
    }
    return this;
  }

  /* override */
  removeEventListener(type, listener, options = {}) {
    super.removeEventListener(type, listener, options);
    if(this.body.onBeforeRender && type === 'beforerender') {
      const listeners = this.getListeners('beforerender');
      if(listeners.length === 0) {
        const idx = this.body.beforeRenderCallbacks.indexOf(this[_beforeRender]);
        if(idx >= 0) this.body.beforeRenderCallbacks.splice(idx, 1);
      }
    } else if(this.body.onAfterRender && type === 'afterrender') {
      const listeners = this.getListeners('afterrender');
      if(listeners.length === 0) {
        const idx = this.body.afterRenderCallbacks.indexOf(this[_afterRender]);
        if(idx >= 0) this.body.afterRenderCallbacks.splice(idx, 1);
      }
    }
    return this;
  }

  remesh() {
    this.setGeometry();
  }

  /* override */
  updateMesh() {
    if(this.program) {
      const oldMesh = this.mesh;
      this.remesh();
      const newMesh = this.mesh;
      this.dispatchEvent({type: 'updatemesh', detail: {oldMesh, newMesh}});
    }
  }

  /* override */
  onPropertyChange(key, newValue, oldValue) {
    super.onPropertyChange(key, newValue, oldValue);
    if(key === 'colors' || key === 'colorDivisor') {
      if(newValue !== oldValue) {
        const program = this.program;
        if(program && program.extraAttribute.color) {
          const geometry = this.geometry;
          colorAttribute(this, geometry);
        }
      }
    }
    if(key === 'mode') {
      const program = this.program;
      if(program) {
        this.body.mode = program.gl[newValue];
      }
    }
  }
}

registerNode(Mesh3d, 'mesh3d');