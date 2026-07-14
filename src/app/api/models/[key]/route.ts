/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';



export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
    const { key } = await params;

    if (!key.endsWith('.glb')) {
        return new NextResponse('Only .glb files are allowed', { status: 400 });
    }

    try {
        const cf = await getCloudflareContext();
        const env = cf.env;

        // Debug: Check if bucket binding exists
        if (!env || !env.MODELS_BUCKET) {
            return NextResponse.json({
                error: 'R2 bucket binding not found',
                envKeys: Object.keys(env || {}),
                hasEnv: !!env
            }, { status: 500 });
        }

        const r2Key = `3d-models/${key}`;
        const object = await env.MODELS_BUCKET.get(r2Key);

        if (!object) {
            return NextResponse.json({
                error: 'Model not found in R2',
                requestedKey: r2Key,
                bucketName: 'armodelviewer'
            }, { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('content-type', 'model/gltf-binary');

        // CORS Headers
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

        return new NextResponse(object.body, {
            headers,
        });
    } catch (e: any) {
        return NextResponse.json({
            error: 'Exception fetching model',
            message: e.message,
            stack: e.stack
        }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
