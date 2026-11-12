import { describe, expect, it } from 'vitest';
import { createEvolutionProvider } from '../src/whatsapp/evolution';
import { extractContent, parseVcard } from '../src/whatsapp/evolution-content';

// Formatos tirados das mensagens reais da instância (Evolution 2.3.7), sem o conteúdo das conversas.
const provider = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo' });
const key = { remoteJid: '5519981342207@s.whatsapp.net', fromMe: false, id: 'M1' };
const upsert = (message: object, extra: object = {}) => ({ event: 'messages.upsert', instance: 'demo', data: { key, pushName: 'Ana', message, messageTimestamp: 1794500000, ...extra } });
const one = (message: object, extra?: object) => provider.normalize(upsert(message, extra))[0] as any;
const long = (n: number) => ({ low: n, high: 0, unsigned: true });

describe('cada tipo de mensagem', () => {
  it('figurinha vira sticker, com animação e Lottie', () => {
    const m = one({ stickerMessage: { mimetype: 'image/webp', width: 512, height: 512, isAnimated: true, isLottie: false, fileLength: long(20000) }, base64: 'AAAA' });
    expect(m).toMatchObject({ type: 'sticker', text: null, media: { kind: 'sticker', mime: 'image/webp', base64: 'AAAA' }, meta: { animated: true, width: 512 } });
    expect(one({ lottieStickerMessage: { message: { stickerMessage: { isLottie: true } } } })).toMatchObject({ type: 'sticker', meta: { lottie: true }, media: { mime: 'application/was' } });
  });

  it('áudio guarda duração, se é de voz e a forma de onda', () => {
    const waveform = Buffer.from(Array.from({ length: 64 }, (_, i) => i)).toString('base64');
    const m = one({ audioMessage: { ptt: true, seconds: 37, mimetype: 'audio/ogg; codecs=opus', waveform } });
    expect(m).toMatchObject({ type: 'audio', meta: { ptt: true, seconds: 37 }, media: { kind: 'audio' } });
    expect(m.meta.waveform).toHaveLength(64);
    expect(one({ audioMessage: { seconds: 5, waveform: { 0: 10, 1: 200, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 } } }).meta.waveform).toEqual([10, 100, 3, 4, 5, 6, 7, 8]);
  });

  it('vídeo, recado de vídeo (ptv) e gif', () => {
    expect(one({ videoMessage: { seconds: 12, width: 720, height: 1280, caption: 'olha', mimetype: 'video/mp4' } })).toMatchObject({ type: 'video', text: 'olha', meta: { seconds: 12, width: 720 } });
    expect(one({ ptvMessage: { seconds: 8, mimetype: 'video/mp4' } })).toMatchObject({ type: 'video', meta: { round: true, seconds: 8 } });
    expect(one({ videoMessage: { gifPlayback: true } })).toMatchObject({ type: 'video', meta: { gif: true } });
  });

  it('documento traz nome, tamanho e páginas; com legenda também', () => {
    expect(one({ documentMessage: { fileName: 'guia.pdf', mimetype: 'application/pdf', pageCount: 3, fileLength: long(123456) } })).toMatchObject({ type: 'documento', meta: { fileName: 'guia.pdf', pages: 3, size: 123456 } });
    expect(one({ documentWithCaptionMessage: { message: { documentMessage: { fileName: 'a.pdf', caption: 'segue' } } } })).toMatchObject({ type: 'documento', text: 'segue', meta: { fileName: 'a.pdf' } });
  });

  it('foto de álbum chega embrulhada (associatedChildMessage) e o cabeçalho do álbum é ignorado', () => {
    expect(one({ associatedChildMessage: { message: { imageMessage: { mimetype: 'image/jpeg', width: 10, height: 20 } } } })).toMatchObject({ type: 'imagem', meta: { width: 10, height: 20 } });
    expect(provider.normalize(upsert({ albumMessage: { expectedImageCount: 3 } }))).toEqual([]);
  });

  it('visualização única e encaminhada', () => {
    expect(one({ viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } })).toMatchObject({ type: 'imagem', meta: { viewOnce: true } });
    expect(one({ conversation: 'oi', }, {})).toMatchObject({ type: 'texto', meta: {} });
    expect(one({ extendedTextMessage: { text: 'fwd', contextInfo: { isForwarded: true, forwardingScore: 1 } } })).toMatchObject({ meta: { forwarded: true } });
  });

  it('localização e localização em tempo real', () => {
    expect(one({ locationMessage: { degreesLatitude: -23.2, degreesLongitude: -45.9, name: 'Padaria', address: 'Rua X' } })).toMatchObject({ type: 'localizacao', meta: { location: { lat: -23.2, lng: -45.9, name: 'Padaria', address: 'Rua X' } } });
    expect(one({ liveLocationMessage: { degreesLatitude: 1, degreesLongitude: 2 } })).toMatchObject({ type: 'localizacao', meta: { location: { live: true } } });
  });

  it('contato e vários contatos (vCard)', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Bia Lima\nitem1.TEL;waid=5512999990000:+55 12 99999-0000\nEND:VCARD';
    expect(one({ contactMessage: { displayName: 'Bia', vcard } })).toMatchObject({ type: 'contato', meta: { contacts: [{ name: 'Bia', phones: ['+5512999990000'] }] } });
    expect(one({ contactsArrayMessage: { contacts: [{ vcard }, { displayName: 'Zé', vcard: 'BEGIN:VCARD\nTEL:1234\nEND:VCARD' }] } }).meta.contacts).toEqual([{ name: 'Bia Lima', phones: ['+5512999990000'] }, { name: 'Zé', phones: ['1234'] }]);
    expect(parseVcard(null, null)).toEqual({ name: 'Contato', phones: [] });
  });

  it('enquete', () => {
    expect(one({ pollCreationMessageV3: { name: 'Melhor dia?', options: [{ optionName: 'Seg' }, { optionName: 'Ter' }], selectableOptionsCount: 1 } }))
      .toMatchObject({ type: 'enquete', text: 'Melhor dia?', meta: { poll: { name: 'Melhor dia?', options: ['Seg', 'Ter'], multiple: false } } });
  });

  it('mensagens de empresa: modelo, interativa, botões, lista e as respostas', () => {
    const tpl = one({ templateMessage: { hydratedTemplate: { hydratedContentText: 'Seu pedido saiu', hydratedFooterText: 'Loja', imageMessage: { mimetype: 'image/jpeg' }, hydratedButtons: [{ quickReplyButton: { displayText: 'Atendimento' } }, { urlButton: { displayText: 'Rastrear', url: 'https://x.y' } }] } } });
    expect(tpl).toMatchObject({ type: 'imagem', text: 'Seu pedido saiu', meta: { footer: 'Loja', buttons: [{ label: 'Atendimento' }, { label: 'Rastrear', url: 'https://x.y' }] } });
    const inter = one({ interactiveMessage: { body: { text: 'Veja' }, header: { videoMessage: { seconds: 4 } }, nativeFlowMessage: { buttons: [{ name: 'cta_url', buttonParamsJson: '{"display_text":"Abrir","url":"https://a.b"}' }] } } });
    expect(inter).toMatchObject({ type: 'video', text: 'Veja', meta: { buttons: [{ label: 'Abrir', url: 'https://a.b' }] } });
    expect(one({ templateButtonReplyMessage: { selectedDisplayText: 'Sim, reconheço', selectedId: 'x' } })).toMatchObject({ type: 'texto', text: 'Sim, reconheço' });
    expect(one({ buttonsResponseMessage: { selectedDisplayText: 'Quero' } })).toMatchObject({ text: 'Quero' });
    expect(one({ listResponseMessage: { title: 'Plano B' } })).toMatchObject({ text: 'Plano B' });
    expect(one({ listMessage: { title: 'Cardápio', description: 'Escolha', sections: [{ rows: [{ title: 'Pizza' }] }] } })).toMatchObject({ text: 'Cardápio\n\nEscolha', meta: { buttons: [{ label: 'Pizza' }] } });
  });

  it('convite de grupo e evento', () => {
    expect(one({ groupInviteMessage: { groupName: 'Turma', caption: 'entra aí' } })).toMatchObject({ type: 'outro', text: 'entra aí', meta: { invite: { group: 'Turma' } } });
    expect(one({ eventMessage: { name: 'Reunião', startTime: long(1794500000) } })).toMatchObject({ type: 'outro', meta: { event: { name: 'Reunião', startsAt: new Date(1794500000 * 1000).toISOString() } } });
  });

  it('tipo desconhecido não some: vira "outro" com o nome do tipo', () => {
    expect(one({ productMessage: { product: {} } })).toMatchObject({ type: 'outro', meta: { unsupported: 'productMessage' } });
  });

  it('controle e criptografia não viram mensagem', () => {
    for (const m of [{ placeholderMessage: { type: 0 } }, { secretEncryptedMessage: {} }, { senderKeyDistributionMessage: {} }, {}]) {
      expect(provider.normalize(upsert(m))).toEqual([]);
    }
    expect(extractContent({ conversation: '' })).toBeNull();
  });
});

describe('eventos sobre outra mensagem', () => {
  it('reação e remoção da reação', () => {
    expect(one({ reactionMessage: { key: { id: 'ALVO' }, text: '❤️' } })).toMatchObject({ kind: 'reaction', targetExternalId: 'ALVO', emoji: '❤️', fromMe: false, phoneE164: '5519981342207' });
    expect(one({ reactionMessage: { key: { id: 'ALVO' }, text: '' } })).toMatchObject({ kind: 'reaction', emoji: null });
  });

  it('voto em enquete (a Evolution já troca o hash pelo nome da opção)', () => {
    expect(one({ pollUpdateMessage: { pollCreationMessageKey: { id: 'POLL' }, vote: { selectedOptions: ['Ter'] } } })).toMatchObject({ kind: 'poll_vote', targetExternalId: 'POLL', options: ['Ter'] });
  });

  it('edição e "apagar para todos" (messages.edited)', () => {
    const edited = provider.normalize({ event: 'messages.edited', data: { key: { id: 'ALVO' }, type: 14, editedMessage: { conversation: 'texto novo' } } });
    expect(edited).toMatchObject([{ kind: 'edit', targetExternalId: 'ALVO', text: 'texto novo' }]);
    expect(provider.normalize({ event: 'MESSAGES_EDITED', data: { key: { id: 'ALVO' }, type: 'REVOKE' } })).toMatchObject([{ kind: 'revoke', targetExternalId: 'ALVO' }]);
    expect(provider.normalize({ event: 'messages.edited', data: { key: { id: 'ALVO' }, type: 3 } })).toEqual([]);
  });

  it('mensagem apagada (messages.delete)', () => {
    expect(provider.normalize({ event: 'messages.delete', data: { id: 'ALVO', remoteJid: key.remoteJid, fromMe: false, status: 'DELETED' } })).toMatchObject([{ kind: 'revoke', targetExternalId: 'ALVO' }]);
  });

  it('do histórico, mensagem com status EDITED vem marcada', () => {
    expect(one({ conversation: 'oi' }, { status: 'EDITED' })).toMatchObject({ kind: 'message', edited: true });
  });

  it('citação de figurinha e de enquete mostra o tipo', () => {
    const m = one({ extendedTextMessage: { text: 'kkk', contextInfo: { stanzaId: 'Q1', quotedMessage: { stickerMessage: {} } } } });
    expect(m.quoted).toEqual({ externalId: 'Q1', text: 'Figurinha' });
    const p = one({ extendedTextMessage: { text: 'ok', contextInfo: { stanzaId: 'Q2', quotedMessage: { pollCreationMessage: { name: 'Dia?', options: [] } } } } });
    expect(p.quoted).toEqual({ externalId: 'Q2', text: 'Dia?' });
  });
});
