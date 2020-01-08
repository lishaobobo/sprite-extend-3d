import {registerNode} from 'spritejs';
import {Box} from 'ogl';
import Geometry from './geometry';
import CubeAttr from '../attribute/cube';

export default class Cube extends Geometry {
  static Attr = CubeAttr;

  constructor(program, attrs = {}) {
    super(program, attrs);
    this.updateMesh();
  }

  remesh() {
    const gl = this.program.gl;
    const {width, height, depth, widthSegments, heightSegments, depthSegments} = this.attributes;
    const geometry = new Box(gl, {
      width,
      height,
      depth,
      widthSegments,
      heightSegments,
      depthSegments});
    this.setGeometry(geometry);
  }

  /* override */
  onPropertyChange(key, newValue, oldValue) {
    super.onPropertyChange(key, newValue, oldValue);
    if(key === 'width'
      || key === 'height'
      || key === 'depth'
      || key === 'widthSegments'
      || key === 'heightSegments'
      || key === 'depthSegments') {
      if(newValue !== oldValue) {
        this.updateMesh();
      }
    }
  }
}

registerNode(Cube, 'cube');