const axios = require('axios')
const fs = require('../libs/fsExtra')
const Logger = require('../Logger')
const Path = require('path')
const FormData = require('form-data')

class TranscriptionManager {
  constructor() {
    this.asrServerUrl = 'http://192.168.0.213:9005'
  }

  /**
   * Get supported audio formats for transcription
   * @returns {string[]}
   */
  getSupportedAudioFormats() {
    return ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'wma', 'aac']
  }

  /**
   * Check if ASR server is healthy and responding
   * @returns {Promise<boolean>}
   */
  async checkAsrServerHealth() {
    try {
      // Try the root endpoint or OpenAPI docs endpoint instead of /health
      const response = await axios.get(`${this.asrServerUrl}/`, { timeout: 5000 })
      return response.status === 200
    } catch (error) {
      try {
        // Fallback: try the OpenAPI docs endpoint
        const response = await axios.get(`${this.asrServerUrl}/docs`, { timeout: 5000 })
        return response.status === 200
      } catch (docsError) {
        Logger.warn(`[TranscriptionManager] ASR server health check failed:`, error.message)
        return false
      }
    }
  }

  /**
   * Start transcription for a podcast episode
   * @param {Object} episode - The podcast episode
   * @param {string} audioFilePath - Path to the audio file
   * @returns {Promise<void>}
   */
  async transcribeEpisode(episode, audioFilePath) {
    try {
      Logger.info(`[TranscriptionManager] Starting transcription for episode "${episode.title}" (${episode.id})`)

      // Update episode status to processing
      await episode.update({
        transcriptionStatus: 'processing',
        transcriptionRequestedAt: new Date(),
        transcriptionError: null
      })

      // Read the audio file
      const audioBuffer = await fs.readFile(audioFilePath)
      const filename = Path.basename(audioFilePath)

      // Use form-data library for proper multipart handling
      const formData = new FormData()
      
      // Add the audio file
      formData.append('audio_file', audioBuffer, {
        filename: filename,
        contentType: 'audio/mpeg'
      })

      // Make request to ASR server
      const response = await axios.post(`${this.asrServerUrl}/asr`, formData, {
        headers: {
          ...formData.getHeaders()
        },
        params: {
          task: 'transcribe',
          language: 'auto',
          output: 'txt',
          encode: true
        },
        timeout: 1800000, // 30 minute timeout
        maxBodyLength: Infinity, // Allow unlimited request body size
        maxContentLength: Infinity // Allow unlimited response size
      })

      if (response.status !== 200) {
        throw new Error(`ASR server returned status ${response.status}`)
      }

      const transcriptionText = response.data
      if (!transcriptionText || typeof transcriptionText !== 'string') {
        throw new Error('Invalid transcription response from ASR server')
      }

      // Update episode with transcription results
      await episode.update({
        transcription: transcriptionText.trim(),
        transcriptionStatus: 'completed',
        transcriptionError: null
      })

      Logger.info(`[TranscriptionManager] Successfully completed transcription for episode "${episode.title}" (${episode.id})`)
    } catch (error) {
      Logger.error(`[TranscriptionManager] Failed to transcribe episode "${episode.title}" (${episode.id}):`, error)

      // Update episode with error status
      await episode.update({
        transcriptionStatus: 'failed',
        transcriptionError: error.message || 'Unknown transcription error'
      })

      throw error
    }
  }

  /**
   * Check if episode can be transcribed
   * @param {Object} episode - The podcast episode
   * @returns {Object} - {canTranscribe: boolean, reason?: string}
   */
  canTranscribeEpisode(episode) {
    // Check if episode has an audio file
    if (!episode.audioFile) {
      return {
        canTranscribe: false,
        reason: 'Episode has no audio file'
      }
    }

    // Check if transcription is already in progress
    if (episode.transcriptionStatus === 'processing') {
      return {
        canTranscribe: false,
        reason: 'Transcription already in progress'
      }
    }

    // Check if audio format is supported
    if (!this.isAudioFormatSupported(episode)) {
      // Try to detect the format for error message
      let detectedFormat = episode.audioFile.metadata?.format
      if (!detectedFormat && episode.audioFile.metadata?.filename) {
        detectedFormat = Path.extname(episode.audioFile.metadata.filename).toLowerCase().slice(1)
      }
      if (!detectedFormat && episode.audioFile.metadata?.path) {
        detectedFormat = Path.extname(episode.audioFile.metadata.path).toLowerCase().slice(1)
      }

      return {
        canTranscribe: false,
        reason: `Unsupported audio format: ${detectedFormat || 'unknown'}. Supported formats: ${this.getSupportedAudioFormats().join(', ')}`
      }
    }

    return {
      canTranscribe: true
    }
  }

  /**
   * Check if the episode's audio format is supported
   * @param {Object} episode - The podcast episode
   * @returns {boolean}
   */
  isAudioFormatSupported(episode) {
    if (!episode.audioFile) {
      return false
    }

    // Try to get format from metadata first
    let format = episode.audioFile.metadata?.format

    // If no format in metadata, try to detect from file extension
    if (!format && episode.audioFile.metadata?.filename) {
      const ext = Path.extname(episode.audioFile.metadata.filename).toLowerCase().slice(1)
      format = ext
    }

    // If still no format, try to detect from file path
    if (!format && episode.audioFile.metadata?.path) {
      const ext = Path.extname(episode.audioFile.metadata.path).toLowerCase().slice(1)
      format = ext
    }

    if (!format) {
      return false
    }

    format = format.toLowerCase()
    return this.getSupportedAudioFormats().includes(format)
  }
}

module.exports = TranscriptionManager