/* @flow */

import type {Manifest} from '../../types.js';
import type Config from '../../config.js';
import ExoticResolver from './exotic-resolver.js';
import {removePrefix} from '../../util/misc.js';
import * as versionUtil from '../../util/version.js';
import * as fsUtil from '../../util/fs.js';
import {hashFile} from '../../util/crypto.js';
const fs = require('fs');
const path = require('path');
const tar = require('tar-stream');
const gunzip = require('gunzip-maybe');
const stripBOM = require('strip-bom');

// TODO: Move to utils
function extractPackage(path): Promise<Manifest> {
  return new Promise((resolve, reject) => {
    const fstream = fs.createReadStream(path);
    const chunks = [];
    fstream
      .pipe(gunzip())
      .pipe(tar.extract())
      .on('entry', (header, stream, next) => {
        if (header.name.endsWith('/package.json')) {
          stream.on('data', (data) => chunks.push(data));
          stream.on('end', () => {
            const buffer = Buffer.concat(chunks).toString();
            resolve(JSON.parse(stripBOM(buffer)));
          });
        } else {
          stream.on('end', next);
        }
        stream.resume();
      })
      .on('error', reject)
      .on('finish', () => reject(new Error('no package.json found')));
  });
}

// TODO: Move to utils/config
async function resolveWorkspacePath(config: Config, fragment: string): Promise<string> {
  const location = versionUtil.explodeHashedUrl(removePrefix(fragment, 'project:'));
  const workspace = await fsUtil.find('.yarn.project', config.cwd);
  if (workspace === false) {
    throw new Error('no .yarn.project found');
  }
  return path.resolve(path.dirname(workspace), location.url);
}

export default class PackResolver extends ExoticResolver {

  static protocol = 'project';

  static async calculateHash(config: Config, fragment: string): Promise<string> {
    const path = await resolveWorkspacePath(config, fragment);
    return await hashFile(path);
  }

  async resolve(): Promise<Manifest> {
    const artifact = await resolveWorkspacePath(this.config, this.fragment);

    // calculate the hash of the file
    const hash = await hashFile(artifact);

    // check if the file matches the hash in the lock file
    const shrunk = this.request.getLocked('localTarball');
    if (shrunk && shrunk._remote.hash === hash && !shrunk._remote.reference.startsWith('project:')) {
      return shrunk;
    }
    const pkg = await extractPackage(artifact);
    pkg._uid = hash;
    pkg._remote = {
      type: 'localTarball',
      resolved: this.fragment,
      hash: null,
      registry: this.registry,
      reference: artifact,
    };
    return pkg;
  }
}
