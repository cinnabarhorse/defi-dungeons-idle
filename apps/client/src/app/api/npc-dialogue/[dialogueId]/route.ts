import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { dialogueId: string } }
) {
  try {
    const { dialogueId } = params;

    // Validate dialogueId to prevent path traversal
    if (!dialogueId || !/^[a-z0-9_-]+$/i.test(dialogueId)) {
      return NextResponse.json(
        { error: 'Invalid dialogue ID' },
        { status: 400 }
      );
    }

    // Path to the dialogue file in the server directory
    const dialogueFilePath = path.join(
      process.cwd(),
      '..',
      'server',
      'src',
      'data',
      'npc-dialogues',
      `${dialogueId}.json`
    );

    // Check if file exists
    if (!fs.existsSync(dialogueFilePath)) {
      return NextResponse.json(
        { error: 'Dialogue not found' },
        { status: 404 }
      );
    }

    // Read and parse the dialogue file
    const dialogueContent = fs.readFileSync(dialogueFilePath, 'utf-8');
    const dialogueData = JSON.parse(dialogueContent);

    // Return the dialogue data
    return NextResponse.json(dialogueData);
  } catch (error) {
    console.error('Error loading dialogue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
