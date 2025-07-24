const axios = require('axios')
const fs = require('../libs/fsExtra')
const Logger = require('../Logger')
const Path = require('path')
const FormData = require('form-data')
const Database = require('../Database')
const SocketAuthority = require('../SocketAuthority')

class TranscriptionManager {
  constructor() {
    this.asrServerUrl = 'http://192.168.0.213:9005'
    /** @type {{episodeId: string, libraryItemId: string, title: string, audioFilePath: string, priority: 'auto'|'manual'}[]} */
    this.transcriptionQueue = []
    /** @type {string|null} */
    this.currentTranscriptionEpisodeId = null
    this.isProcessingQueue = false
  }

  /**
   * Get supported audio formats for transcription
   * @returns {string[]}
   */
  getSupportedAudioFormats() {
    return ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'wma', 'aac']
  }

  /**
   * Get items in transcription queue
   * @param {string} [libraryItemId] - Optional filter by library item
   * @returns {Array}
   */
  getTranscriptionQueue(libraryItemId = null) {
    if (libraryItemId) {
      return this.transcriptionQueue.filter(item => item.libraryItemId === libraryItemId)
    }
    return [...this.transcriptionQueue]
  }

  /**
   * Get current transcription status
   * @returns {Object}
   */
  getTranscriptionStatus() {
    return {
      isProcessing: this.isProcessingQueue,
      currentEpisodeId: this.currentTranscriptionEpisodeId,
      queueLength: this.transcriptionQueue.length,
      queue: this.transcriptionQueue.map(item => ({
        episodeId: item.episodeId,
        libraryItemId: item.libraryItemId,
        title: item.title,
        priority: item.priority
      }))
    }
  }

  /**
   * Add episode to transcription queue
   * @param {Object} episode - The podcast episode
   * @param {string} audioFilePath - Path to the audio file
   * @param {string} libraryItemId - Library item ID
   * @param {'auto'|'manual'} [priority='manual'] - Priority level
   * @returns {boolean}
   */
  addToTranscriptionQueue(episode, audioFilePath, libraryItemId, priority = 'manual') {
    // Check if already in queue or currently processing
    if (this.currentTranscriptionEpisodeId === episode.id) {
      Logger.debug(`[TranscriptionManager] Episode ${episode.id} is currently being transcribed`)
      return false
    }

    if (this.transcriptionQueue.some(item => item.episodeId === episode.id)) {
      Logger.debug(`[TranscriptionManager] Episode ${episode.id} is already in transcription queue`)
      return false
    }

    const queueItem = {
      episodeId: episode.id,
      libraryItemId,
      title: episode.title,
      audioFilePath,
      priority
    }

    // Add to queue with priority (manual requests go to front)
    if (priority === 'manual') {
      this.transcriptionQueue.unshift(queueItem)
    } else {
      this.transcriptionQueue.push(queueItem)
    }

    Logger.info(`[TranscriptionManager] Added episode "${episode.title}" to transcription queue (priority: ${priority})`)
    this.processTranscriptionQueue()
    return true
  }

  /**
   * Remove episode from transcription queue
   * @param {string} episodeId - Episode ID to remove
   * @returns {boolean}
   */
  removeFromTranscriptionQueue(episodeId) {
    const initialLength = this.transcriptionQueue.length
    this.transcriptionQueue = this.transcriptionQueue.filter(item => item.episodeId !== episodeId)
    const removed = this.transcriptionQueue.length < initialLength
    
    if (removed) {
      Logger.info(`[TranscriptionManager] Removed episode ${episodeId} from transcription queue`)
    }
    
    return removed
  }

  /**
   * Clear transcription queue
   * @param {string} [libraryItemId] - Optional filter by library item
   */
  clearTranscriptionQueue(libraryItemId = null) {
    if (libraryItemId) {
      const itemQueue = this.transcriptionQueue.filter(item => item.libraryItemId === libraryItemId)
      Logger.info(`[TranscriptionManager] Clearing transcription queue for item "${libraryItemId}" (${itemQueue.length} items)`)
      this.transcriptionQueue = this.transcriptionQueue.filter(item => item.libraryItemId !== libraryItemId)
    } else {
      Logger.info(`[TranscriptionManager] Clearing all transcriptions in queue (${this.transcriptionQueue.length} items)`)
      this.transcriptionQueue = []
    }
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
   * Process transcription queue
   */
  async processTranscriptionQueue() {
    if (this.isProcessingQueue || this.transcriptionQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true
    Logger.info(`[TranscriptionManager] Starting queue processing. Queue length: ${this.transcriptionQueue.length}`)

    while (this.transcriptionQueue.length > 0) {
      const queueItem = this.transcriptionQueue.shift()
      this.currentTranscriptionEpisodeId = queueItem.episodeId

      try {
        // Get the episode from database
        const episode = await Database.podcastEpisodeModel.findByPk(queueItem.episodeId)
        
        if (!episode) {
          Logger.error(`[TranscriptionManager] Episode ${queueItem.episodeId} not found in database, skipping`)
          continue
        }

        // Check if episode can still be transcribed
        const transcriptionCheck = this.canTranscribeEpisode(episode)
        if (!transcriptionCheck.canTranscribe) {
          Logger.warn(`[TranscriptionManager] Episode ${queueItem.episodeId} can no longer be transcribed: ${transcriptionCheck.reason}`)
          continue
        }

        await this.transcribeEpisodeInternal(episode, queueItem.audioFilePath)
        Logger.info(`[TranscriptionManager] Successfully completed transcription for queued episode "${episode.title}"`)
        
        // Emit socket event for real-time updates
        const libraryItem = await Database.libraryItemModel.findByPk(queueItem.libraryItemId)
        if (libraryItem) {
          SocketAuthority.libraryItemEmitter('item_updated', libraryItem)
        }
      } catch (error) {
        Logger.error(`[TranscriptionManager] Failed to transcribe queued episode ${queueItem.episodeId}:`, error)
      }
    }

    this.currentTranscriptionEpisodeId = null
    this.isProcessingQueue = false
    Logger.info('[TranscriptionManager] Queue processing completed')
  }

  /**
   * Add episode to queue and start processing (public method)
   * @param {Object} episode - The podcast episode
   * @param {string} audioFilePath - Path to the audio file
   * @param {string} libraryItemId - Library item ID
   * @param {'auto'|'manual'} [priority='manual'] - Priority level
   * @returns {Promise<boolean>}
   */
  async transcribeEpisode(episode, audioFilePath, libraryItemId, priority = 'manual') {
    return this.addToTranscriptionQueue(episode, audioFilePath, libraryItemId, priority)
  }

  /**
   * Internal transcription method (does the actual work)
   * @param {Object} episode - The podcast episode
   * @param {string} audioFilePath - Path to the audio file
   * @returns {Promise<void>}
   */
  async transcribeEpisodeInternal(episode, audioFilePath) {
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
      const fileExt = Path.extname(filename).toLowerCase().slice(1)

      // Map file extension to proper MIME type
      const mimeTypes = {
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'ogg': 'audio/ogg',
        'wma': 'audio/x-ms-wma',
        'aac': 'audio/aac'
      }
      const contentType = mimeTypes[fileExt] || 'application/octet-stream'

      // Use form-data library for proper multipart handling
      const formData = new FormData()
      
      // Add the audio file
      formData.append('audio_file', audioBuffer, {
        filename: filename,
        contentType: contentType
      })

      Logger.info(`[TranscriptionManager] Sending request with filename: ${filename}, contentType: ${contentType}, fileSize: ${audioBuffer.length}`)

      // Make request to ASR server (without language parameter to let server auto-detect)
      const response = await axios.post(`${this.asrServerUrl}/asr`, formData, {
        headers: {
          ...formData.getHeaders()
        },
        params: {
          task: 'transcribe',
          output: 'txt',
          encode: true
        },
        timeout: 1800000, // 30 minute timeout
        maxBodyLength: Infinity, // Allow unlimited request body size
        maxContentLength: Infinity // Allow unlimited response size
      })

      if (response.status !== 200) {
        throw new Error(`ASR server returned status ${response.status}: ${response.data}`)
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
      
      // Log additional error details
      if (error.response) {
        Logger.error(`[TranscriptionManager] ASR server response status: ${error.response.status}`)
        Logger.error(`[TranscriptionManager] ASR server response data:`, error.response.data)
        Logger.error(`[TranscriptionManager] ASR server response headers:`, error.response.headers)
      }

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