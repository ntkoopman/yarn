/* @flow */

const crypto = require('crypto');
const stream = require('stream');
const fs = require('fs');

export function hash(content: string, type: string = 'md5'): string {
  return crypto.createHash(type).update(content).digest('hex');
}

const cache = {};
export function hashFile(path: string): Promise<string> {
  if (path in cache) {
    return Promise.resolve(cache[path]);
  }
  return new Promise((resolve, reject) => {
    const validateStream = new HashStream();
    fs.createReadStream(path)
      .pipe(validateStream)
      .on('error', reject)
      .on('finish', () => {
        const hash = validateStream.getHash();
        cache[path] = hash;
        resolve(hash);
      });
  });
}

type HashOptions = duplexStreamOptions;

export class HashStream extends stream.Transform {
  constructor(options?: HashOptions) {
    super(options);
    this._hash = crypto.createHash('sha1');
    this._updated = false;
  }

  _hash: crypto$Hash;
  _updated: boolean;

  _transform(
    chunk: Buffer | string,
    encoding: string,
    callback: (error: ?Error, data?: Buffer | string) => void,
  ) {
    this._updated = true;
    this._hash.update(chunk);
    callback(null, chunk);
  }

  getHash(): string {
    return this._hash.digest('hex');
  }

  test(sum: string): boolean {
    return this._updated && sum === this.getHash();
  }
}
