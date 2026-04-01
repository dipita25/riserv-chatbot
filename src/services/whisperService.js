import OpenAI from 'openai';
import { createWriteStream, unlinkSync, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================================
// TRANSCRIPTION DEPUIS META (audio_id)
// ================================
export async function transcrireAudio(audioId) {
  try {
    // Récupérer l'URL de téléchargement depuis Meta
    const urlResponse = await fetch(
      `https://graph.facebook.com/v18.0/${audioId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.META_TOKEN}`,
        },
      }
    );
    const { url } = await urlResponse.json();

    const audioResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.META_TOKEN}`,
      },
    });

    const cheminTemp = `/tmp/audio_${Date.now()}.ogg`;
    await pipeline(audioResponse.body, createWriteStream(cheminTemp));

    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(cheminTemp),
      model: 'whisper-1',
    });

    unlinkSync(cheminTemp);

    console.log(`Transcription audio Meta : "${transcription.text}"`);
    return transcription.text;
  } catch (err) {
    console.error('Erreur transcription audio Meta :', err.message);
    return '';
  }
}

// ================================
// TRANSCRIPTION DEPUIS TWILIO (URL directe)
// ================================
export async function transcrireAudioUrl(mediaUrl) {
  try {
    // Twilio requiert une auth basique pour accéder aux médias
    const credentials = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString('base64');

    const audioResponse = await fetch(mediaUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    const cheminTemp = `/tmp/audio_${Date.now()}.ogg`;
    await pipeline(audioResponse.body, createWriteStream(cheminTemp));

    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(cheminTemp),
      model: 'whisper-1',
    });

    unlinkSync(cheminTemp);

    console.log(`Transcription audio Twilio : "${transcription.text}"`);
    return transcription.text;
  } catch (err) {
    console.error('Erreur transcription audio Twilio :', err.message);
    return '';
  }
}
