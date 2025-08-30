import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Backend services are temporarily unavailable. Please try again later.',
        details: 'Database connection failed'
      }
    },
    { status: 503 }
  );
}