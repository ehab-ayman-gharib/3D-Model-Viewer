/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith('.glb')) {
            return NextResponse.json({ error: 'Only .glb files are allowed' }, { status: 400 });
        }

        const cf = await getCloudflareContext();
        const env = cf.env;

        if (!env || !env.MODELS_BUCKET) {
            return NextResponse.json({ error: 'R2 bucket binding not found' }, { status: 500 });
        }

        // Generate a unique ID for the model
        const modelId = crypto.randomUUID().replace(/-/g, '').substring(0, 10); // e.g. a 10 char alphanumeric ID
        const r2Key = `3d-models/${modelId}.glb`;

        // Read the file as an ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Upload to R2
        await env.MODELS_BUCKET.put(r2Key, arrayBuffer, {
            httpMetadata: {
                contentType: 'model/gltf-binary',
            }
        });

        const headers = new Headers();
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

        return NextResponse.json({ 
            success: true, 
            modelId: `${modelId}.glb`,
            id: modelId
        }, { status: 200, headers });

    } catch (error: any) {
        console.error('Upload Error:', error);
        return NextResponse.json({
            error: 'Exception uploading model',
            message: error.message
        }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
