import * as crypto from 'node:crypto';
import type * as net from 'node:net';
import * as tls from 'node:tls';

export interface TestCertificate {
    cert: string;
    key: string;
    name: string;
    privateKey: crypto.KeyObject;
}

export interface TestCertificateOptions {
    commonName: string;
    // DNS names the certificate is for; a CA has none
    hosts?: string[];
    isCa?: boolean;
    // Self-signed without one
    issuer?: TestCertificate;
    // A CA whose key usage allows signing data but not certificates
    keyUsageWithoutCertSign?: boolean;
    notAfter?: Date;
    notBefore?: Date;
}

// One DER element: its tag, the length of its content in as few bytes as
// it takes, then the content
function der(tag: number, ...content: Buffer[]): Buffer {
    const body = Buffer.concat(content);
    const lengthBytes: number[] = [];
    for (let rest = body.length; rest > 0; rest = Math.floor(rest / 256)) {
        lengthBytes.unshift(rest % 256);
    }
    const length = body.length < 128 ? [body.length] : [0x80 + lengthBytes.length, ...lengthBytes];
    return Buffer.concat([Buffer.from([tag, ...length]), body]);
}

function sequence(...content: Buffer[]): Buffer {
    return der(0x30, ...content);
}

function objectId(dotted: string): Buffer {
    const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
    const bytes = [first * 40 + second];
    for (const arc of rest) {
        const base128 = [arc % 128];
        for (let value = Math.floor(arc / 128); value > 0; value = Math.floor(value / 128)) {
            base128.unshift(value % 128 + 128);
        }
        bytes.push(...base128);
    }
    return der(0x06, Buffer.from(bytes));
}

function distinguishedName(commonName: string): Buffer {
    return sequence(der(0x31, sequence(objectId('2.5.4.3'), der(0x0c, Buffer.from(commonName)))));
}

// UTCTime (YYMMDDHHMMSSZ), which covers 1950 to 2049
function utcTime(date: Date): Buffer {
    return der(0x17, Buffer.from(date.toISOString().replace(/^\d\d|[-:T]|\.\d+/g, '')));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRUE = der(0x01, Buffer.from([0xff]));

/**
 * An X.509 certificate with a fresh P-256 key, built here so that tests need
 * no certificate tooling and no private key is checked in. It carries just
 * what a TLS client checks: the names, the validity dates, the hosts it is
 * for, and whether it may sign other certificates.
 */
export function createTestCertificate(options: TestCertificateOptions): TestCertificate {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const notBefore = options.notBefore ?? new Date(Date.now() - DAY_MS);
    const notAfter = options.notAfter ?? new Date(Date.now() + DAY_MS);
    const ecdsaWithSha256 = sequence(objectId('1.2.840.10045.4.3.2'));
    const basicConstraints = sequence(objectId('2.5.29.19'), TRUE, der(0x04, sequence(TRUE)));
    // digitalSignature alone: the first bit, with the other seven unused
    const digitalSignatureOnly = sequence(objectId('2.5.29.15'), TRUE, der(0x04, der(0x03, Buffer.from([7, 0x80]))));
    const subjectAltName = sequence(objectId('2.5.29.17'), der(0x04, sequence(...(options.hosts ?? []).map(host => der(0x82, Buffer.from(host))))));
    const extensions = options.isCa
        ? [basicConstraints, ...(options.keyUsageWithoutCertSign ? [digitalSignatureOnly] : [])]
        : [subjectAltName];
    // A positive serial with no leading zero byte
    const serial = Buffer.concat([Buffer.from([64 + crypto.randomInt(64)]), crypto.randomBytes(7)]);

    const toBeSigned = sequence(
        der(0xa0, der(0x02, Buffer.from([2]))),
        der(0x02, serial),
        ecdsaWithSha256,
        distinguishedName(options.issuer?.name ?? options.commonName),
        sequence(utcTime(notBefore), utcTime(notAfter)),
        distinguishedName(options.commonName),
        publicKey.export({ type: 'spki', format: 'der' }),
        der(0xa3, sequence(...extensions))
    );
    const signature = crypto.sign('sha256', toBeSigned, options.issuer?.privateKey ?? privateKey);
    const certificate = sequence(toBeSigned, ecdsaWithSha256, der(0x03, Buffer.from([0]), signature));
    const base64Lines = certificate.toString('base64').match(/.{1,64}/g) ?? [];

    return {
        cert: `-----BEGIN CERTIFICATE-----\n${base64Lines.join('\n')}\n-----END CERTIFICATE-----\n`,
        key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        name: options.commonName,
        privateKey
    };
}

export interface TestTlsServer {
    port: number;
    stop: () => Promise<void>;
}

// A local TLS server presenting `chain`, leaf first. A client that accepts
// the chain gets a 200 with no body.
export async function startTlsServer(chain: TestCertificate[]): Promise<TestTlsServer> {
    const sockets = new Set<net.Socket>();
    const server = tls.createServer({
        cert: chain.map(certificate => certificate.cert).join(''),
        key: chain[0]?.key
    }, (socket) => {
        socket.on('error', () => undefined);
        socket.once('data', () => {
            socket.end('HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
        });
    });
    server.on('connection', (socket: net.Socket) => {
        sockets.add(socket);
        socket.on('close', () => {
            sockets.delete(socket);
        });
    });
    server.on('tlsClientError', () => undefined);

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as net.AddressInfo;

    return {
        port,
        stop: () => new Promise<void>((resolve) => {
            for (const socket of sockets) {
                socket.destroy();
            }
            server.close(() => {
                resolve();
            });
        })
    };
}
