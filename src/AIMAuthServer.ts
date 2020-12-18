import net, { Socket, Server } from 'net';
import assert from 'assert';
import { Flap } from './types';
import { buildFlap, parseFlap } from './flapUtils';
import { matchSnac, parseSnac } from './snacUtils';
import { authKeyResponseSnac } from './serverSentSnacs';
import { parseAuthRequest, parseMD5LoginRequest } from './clientSnacs';

interface AIMAuthServerOpts {
    port?: number;
    host?: string;
}

/**
 * @summary The first server an Oscar Protocol client
 *          connects to when signing on. Confirms client
 *          credentials, and returns a cookie and address
 *          to contact the next service (the BOSS server)
 */
export class AIMAuthServer {
    private server: Server;
    private host: string;
    private port: number;

    constructor(opts: AIMAuthServerOpts = {}) {
        this.host = opts.host ?? '0.0.0.0';
        this.port = opts.port ?? 5190;
        this.server = net.createServer(this.onNewConnection.bind(this));
        this.server.on('error', this.onServerError.bind(this));
    }

    private onServerError(error: Error) {
        console.error('Server Error: ', error);
    }

    /**
     * @see http://web.archive.org/web/20080308233204/http://dev.aol.com/aim/oscar/#FLAP__SIGNON_FRAME
     */
    private onNewConnection(socket: Socket) {
        const address = socket.remoteAddress;
        const port = socket.remotePort;
        console.log(`AIMAuthServer: New connection from ${address}:${port}`);

        socket.once('connect', () => console.log('new socket connection'));
        socket.on('error', () => console.log('socket error'));
        socket.on('end', () => console.log('socked closed'));
        socket.on('close', () => console.log('socket closed'));
        socket.on('data', (data) => this.onSocketData(data, socket));

        socket.write(
            buildFlap({
                channel: 1,
                // TODO: Sequence numbers should be generated in an abstraction around socket.write,
                // to prevent out-of-order sequences, which is a fatal error for an OSCAR client
                sequence: 1,
                data: Buffer.from([0x1]), // Flap version 1
            }),
        );

        // TODO: Setup state for the connection
        // Need to track some things, including the
        // salt/challenge for hashed passwords
    }

    private onChannel1(flap: Flap, socket: Socket) {
        const flapVersion = flap.data.readUInt32BE(0);
        assert(flapVersion === 0x1, 'Incorrect client FLAP version');
    }

    private onChannel2(flap: Flap, socket: Socket) {
        console.log('channel 2 flap', flap);
        const snac = parseSnac(flap.data);

        if (matchSnac(snac, 'AUTH', 'MD5_AUTH_REQUEST')) {
            const authReq = parseAuthRequest(snac.data);
            // Can be _any_ server generated string with len < size of u32 int
            const authKey = Math.round(Math.random() * 1000).toString();
            const responseFlap = buildFlap({
                channel: 2,
                sequence: 2,
                data: authKeyResponseSnac(authKey, snac.requestID),
            });

            socket.write(responseFlap);
            return;
        }

        if (matchSnac(snac, 'AUTH', 'LOGIN_REQUEST')) {
            const payload = parseMD5LoginRequest(snac.data);
            console.log(payload);
            // TODO: Validate credentials, then send SNAC 17 03
            // http://iserverd1.khstu.ru/oscar/snac_17_03.html
            return;
        }

        console.log('Unhandled Channel 2 Flap: ', flap);
    }

    private onChannel3(flap: Flap, socket: Socket) {
        console.log('Channel 3 Flap: ', flap);
    }

    private onChannel4(flap: Flap, socket: Socket) {
        console.log('Channel 4 Flap: ', flap);
    }

    private onChannel5(flap: Flap, socket: Socket) {
        console.log('Channel 5 Flap: ', flap);
    }

    private onSocketData(data: Buffer, socket: Socket) {
        const flap = parseFlap(data);
        const handlers: ChannelHandlers = {
            1: this.onChannel1,
            2: this.onChannel2,
            3: this.onChannel3,
            4: this.onChannel4,
            5: this.onChannel5,
        };
        const handler = handlers[flap.channel];

        if (!handler) {
            console.warn(
                `AIMAuthServer: Unrecognized FLAP channel "${flap.channel}"`,
                flap,
            );
            return;
        }

        handler.call(this, flap, socket);
    }

    listen(): Promise<{ host: string; port: number }> {
        return new Promise((res) => {
            this.server.listen(this.port, this.host, () => {
                const address = this.server.address();
                assert(
                    address && typeof address !== 'string',
                    'Unexpected net.AddressInfo in AIMAuthServer.listen',
                );
                res({ host: address.address, port: address.port });
            });
        });
    }
}

/**
 * @see http://web.archive.org/web/20080308233204/http://dev.aol.com/aim/oscar/#FLAP__FRAME_TYPE
 */
interface ChannelHandlers {
    [key: number]: (flap: Flap, socket: Socket) => void;
}