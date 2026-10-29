// Settings from the page address, and small helpers every module uses.
import * as THREE from 'three';

export const $ = (id) => document.getElementById(id);
export const V3 = THREE.Vector3;
export const Q = THREE.Quaternion;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const params = new URLSearchParams(location.search);
export const PRODUCT_NAME = (params.get('product') || 'hemnes').replace(/[^a-z0-9-]/gi, '');
export const PRODUCT_URL = `products/${PRODUCT_NAME}.json`;
// ?embed: just the 3D view with a play button, for showing a guide inside another page.
// It opens on the finished product and can play the whole build quickly.
export const EMBED = params.has('embed');
export const EMBED_SPEED = Number(params.get('speed')) || 5;
if (EMBED) document.documentElement.classList.add('embed');
