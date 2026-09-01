/**
 * EXTRACTOR MODULE - Extracts metadata from messages
 */

class Extractor {
  constructor() {
    // URL pattern
    this.urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
    // Email pattern
    this.emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/gi;
    // Phone pattern (various formats)
    this.phonePattern = /(?:\+\d{1,3}|0)\d{1,14}|(\d{3}[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
    // Hashtag pattern
    this.hashtagPattern = /#[^\s]+/gi;
    // Mention pattern
    this.mentionPattern = /@[^\s]+/gi;
    // Command pattern
    this.commandPattern = /^[.!\/\\][a-zA-Z0-9_]+/gm;
    // Location pattern (simplified)
    this.locationPattern = /(?:lat|latitude|lon|longitude|location):\s*[-\d.]+/gi;
    // Date pattern (various formats)
    this.datePattern = /\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/g;
  }

  /**
   * Extract all metadata from a message
   */
  async extract(message) {
    const text = message.text || '';
    const sender = message.sender || '';
    const senderNumber = message.senderNumber || '';

    return {
      // Basic info
      timestamp: Date.now(),
      text: text.substring(0, 5000), // Limit to 5000 chars
      phoneNumber: senderNumber,
      pushName: message.raw?.pushName || '',
      contactName: message.raw?.contactName || '',
      profilePicture: message.raw?.profilePicture || null,
      isOnline: true,
      isBot: senderNumber.includes(':') || false,
      isBusiness: message.raw?.isBusiness || false,

      // Extracted data
      links: this.extractLinks(text),
      emails: this.extractEmails(text),
      phones: this.extractPhones(text),
      locations: this.extractLocations(text),
      dates: this.extractDates(text),
      hashtags: this.extractHashtags(text),
      mentions: this.extractMentions(text, message.mentions || []),
      commands: this.extractCommands(text),
      
      // Message properties
      groups: message.isGroup ? [message.chat] : [],
      groupName: message.raw?.pushName || '',
      quotedMessage: message.quoted ? { id: message.quoted.id } : null,
      forwarded: message.raw?.forwarded || false,
      reactions: this.extractReactions(message.raw),
      
      // Media info
      mediaInfo: this.extractMediaInfo(message),
      
      // Language detection (simplified)
      languages: this.detectLanguage(text)
    };
  }

  /**
   * Extract URLs from text
   */
  extractLinks(text) {
    if (!text) return [];
    const links = [];
    let match;
    while ((match = this.urlPattern.exec(text)) !== null) {
      links.push(match[0]);
    }
    return [...new Set(links)]; // Remove duplicates
  }

  /**
   * Extract emails from text
   */
  extractEmails(text) {
    if (!text) return [];
    const emails = [];
    let match;
    while ((match = this.emailPattern.exec(text)) !== null) {
      const email = match[0].toLowerCase();
      if (this.isValidEmail(email)) {
        emails.push(email);
      }
    }
    return [...new Set(emails)];
  }

  /**
   * Extract phone numbers from text
   */
  extractPhones(text) {
    if (!text) return [];
    const phones = [];
    let match;
    while ((match = this.phonePattern.exec(text)) !== null) {
      const phone = match[0].replace(/\D/g, '');
      if (phone.length >= 7 && phone.length <= 15) {
        phones.push(phone);
      }
    }
    return [...new Set(phones)];
  }

  /**
   * Extract locations from text
   */
  extractLocations(text) {
    if (!text) return [];
    const locations = [];
    let match;
    while ((match = this.locationPattern.exec(text)) !== null) {
      locations.push(match[0]);
    }
    return [...new Set(locations)];
  }

  /**
   * Extract dates from text
   */
  extractDates(text) {
    if (!text) return [];
    const dates = [];
    let match;
    while ((match = this.datePattern.exec(text)) !== null) {
      dates.push(match[0]);
    }
    return [...new Set(dates)];
  }

  /**
   * Extract hashtags from text
   */
  extractHashtags(text) {
    if (!text) return [];
    const hashtags = [];
    let match;
    while ((match = this.hashtagPattern.exec(text)) !== null) {
      hashtags.push(match[0].toLowerCase());
    }
    return [...new Set(hashtags)];
  }

  /**
   * Extract mentions from text and metadata
   */
  extractMentions(text, mentionedJids = []) {
    const mentions = [];
    
    // From metadata
    for (const jid of mentionedJids) {
      const number = (jid || '').split('@')[0];
      if (number) mentions.push(number);
    }

    // From text
    let match;
    while ((match = this.mentionPattern.exec(text)) !== null) {
      mentions.push(match[0].substring(1)); // Remove @
    }

    return [...new Set(mentions)];
  }

  /**
   * Extract commands from text
   */
  extractCommands(text) {
    if (!text) return [];
    const commands = [];
    let match;
    while ((match = this.commandPattern.exec(text)) !== null) {
      const cmd = match[0].substring(1).toLowerCase(); // Remove prefix
      commands.push(cmd);
    }
    return [...new Set(commands)];
  }

  /**
   * Extract reactions from message
   */
  extractReactions(rawMessage) {
    const reactions = [];
    if (rawMessage?.message?.reactionMessage) {
      reactions.push({
        emoji: rawMessage.message.reactionMessage.text,
        messageId: rawMessage.message.reactionMessage.key.id
      });
    }
    return reactions;
  }

  /**
   * Extract media information
   */
  extractMediaInfo(message) {
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    const m = message.raw?.message || {};

    for (const mediaType of mediaTypes) {
      if (m[mediaType]) {
        const media = m[mediaType];
        return {
          type: mediaType.replace('Message', ''),
          size: media.fileLength || 0,
          mimetype: media.mimetype || '',
          url: media.url || media.directPath || '',
          filename: media.fileName || media.title || 'file',
          duration: media.seconds || 0,
          width: media.width || 0,
          height: media.height || 0,
          caption: media.caption || ''
        };
      }
    }

    return null;
  }

  /**
   * Detect language (simplified)
   */
  detectLanguage(text) {
    if (!text) return [];
    const languages = [];

    // Check for common language patterns
    if (/[\u0600-\u06FF]/.test(text)) languages.push('ar'); // Arabic
    if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(text)) languages.push('ja-zh'); // Japanese/Chinese
    if (/[\uAC00-\uD7AF]/.test(text)) languages.push('ko'); // Korean
    if (/[\u0400-\u04FF]/.test(text)) languages.push('ru'); // Russian
    if (/[а-яА-Я]/.test(text)) languages.push('ru'); // Cyrillic

    // Default to English if no other language detected
    if (languages.length === 0) languages.push('en');

    return [...new Set(languages)];
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && !email.includes('..') && !email.startsWith('@') && !email.endsWith('@');
  }
}

module.exports = Extractor;
