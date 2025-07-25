<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar page="podcast-search" />

    <div id="bookshelf" class="w-full overflow-y-auto px-2 py-6 sm:px-4 md:p-12 relative">
      <div class="w-full max-w-5xl mx-auto py-4">
        <p class="text-xl mb-2 font-semibold px-4 md:px-0">{{ $strings.HeaderCurrentDownloads }}</p>
        <p v-if="!episodesDownloading.length" class="text-lg py-4">{{ $strings.MessageNoDownloadsInProgress }}</p>
        <template v-for="episode in episodesDownloading">
          <div :key="episode.id" class="flex py-5 relative">
            <covers-preview-cover :src="$store.getters['globals/getLibraryItemCoverSrcById'](episode.libraryItemId)" :width="96" :book-cover-aspect-ratio="bookCoverAspectRatio" :show-resolution="false" class="hidden md:block" />
            <div class="grow pl-4 max-w-2xl">
              <!-- mobile -->
              <div class="flex md:hidden mb-2">
                <covers-preview-cover :src="$store.getters['globals/getLibraryItemCoverSrcById'](episode.libraryItemId)" :width="48" :book-cover-aspect-ratio="bookCoverAspectRatio" :show-resolution="false" class="md:hidden" />
                <div class="grow px-2">
                  <div class="flex items-center">
                    <nuxt-link :to="`/item/${episode.libraryItemId}`" class="text-sm text-gray-200 hover:underline">{{ episode.podcastTitle }}</nuxt-link>
                    <widgets-explicit-indicator v-if="episode.podcastExplicit" />
                  </div>
                  <p class="text-xs text-gray-300 mb-1">{{ $dateDistanceFromNow(episode.publishedAt) }}</p>
                </div>
              </div>
              <!-- desktop -->
              <div class="hidden md:block">
                <div class="flex items-center">
                  <nuxt-link :to="`/item/${episode.libraryItemId}`" class="text-sm text-gray-200 hover:underline">{{ episode.podcastTitle }}</nuxt-link>
                  <widgets-explicit-indicator v-if="episode.podcastExplicit" />
                </div>
                <p class="text-xs text-gray-300 mb-1">{{ $dateDistanceFromNow(episode.publishedAt) }}</p>
              </div>

              <div class="flex items-center font-semibold text-gray-200">
                <div v-if="episode.season || episode.episode">#</div>
                <div v-if="episode.season">{{ episode.season }}x</div>
                <div v-if="episode.episode">{{ episode.episode }}</div>
              </div>

              <div class="flex items-center mb-2">
                <span class="font-semibold text-sm md:text-base">{{ episode.episodeDisplayTitle }}</span>
                <widgets-podcast-type-indicator :type="episode.episodeType" />
              </div>

              <p class="text-sm text-gray-200 mb-4">{{ episode.subtitle }}</p>
            </div>
          </div>
        </template>

        <tables-podcast-download-queue-table v-if="episodeDownloadsQueued.length" :queue="episodeDownloadsQueued"></tables-podcast-download-queue-table>

        <!-- Transcription Queue Section -->
        <div class="mt-12">
          <div class="flex items-center justify-between mb-4">
            <p class="text-xl font-semibold px-4 md:px-0">Transcription Queue</p>
            <div class="flex items-center space-x-2 px-4 md:px-0">
              <div class="flex items-center space-x-2">
                <span class="w-3 h-3 rounded-full" :class="transcriptionStatus.isProcessing ? 'bg-yellow-500' : 'bg-gray-500'"></span>
                <span class="text-sm">{{ transcriptionStatus.isProcessing ? 'Processing' : 'Idle' }}</span>
              </div>
              <ui-btn @click="refreshTranscriptionStatus" size="sm" :loading="loadingTranscriptionStatus">
                <span class="material-symbols text-sm">refresh</span>
              </ui-btn>
            </div>
          </div>

          <div v-if="transcriptionStatus.currentEpisode" class="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mx-4 md:mx-0">
            <div class="flex items-center space-x-3">
              <covers-preview-cover :src="currentTranscriptionCover" :width="48" :book-cover-aspect-ratio="bookCoverAspectRatio" :show-resolution="false" />
              <div class="grow">
                <div class="flex items-center space-x-2 mb-1">
                  <span class="material-symbols text-yellow-500 text-lg animate-spin">hourglass_empty</span>
                  <span class="font-semibold text-sm">Currently Transcribing</span>
                </div>
                <p class="text-sm">{{ getCurrentTranscriptionTitle() }}</p>
                <p class="text-xs text-gray-400">{{ getCurrentTranscriptionPodcast() }}</p>
              </div>
            </div>
          </div>

          <div v-if="!transcriptionStatus.queueLength && !transcriptionStatus.isProcessing" class="text-lg py-4 px-4 md:px-0">
            No transcriptions in progress or queued
          </div>

          <div v-if="transcriptionQueue.length" class="space-y-4">
            <p class="text-sm text-gray-300 px-4 md:px-0 mb-4">Queued Episodes ({{ transcriptionQueue.length }})</p>
            <div v-for="(queueItem, index) in transcriptionQueue" :key="queueItem.episodeId" class="flex items-center p-4 bg-bg border border-white/10 rounded-lg mx-4 md:mx-0">
              <covers-preview-cover :src="getTranscriptionQueueCover(queueItem.libraryItemId)" :width="48" :book-cover-aspect-ratio="bookCoverAspectRatio" :show-resolution="false" />
              <div class="grow pl-4">
                <div class="flex items-center space-x-2 mb-1">
                  <span class="text-xs text-gray-400">#{{ index + 1 }}</span>
                  <span class="text-xs px-2 py-1 rounded" :class="queueItem.priority === 'manual' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'">
                    {{ queueItem.priority }}
                  </span>
                </div>
                <p class="font-semibold text-sm">{{ queueItem.title }}</p>
                <p class="text-xs text-gray-400">{{ getTranscriptionQueuePodcast(queueItem.libraryItemId) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  async asyncData({ params, redirect, store }) {
    var libraryId = params.library
    var libraryData = await store.dispatch('libraries/fetch', libraryId)
    if (!libraryData) {
      return redirect('/oops?message=Library not found')
    }

    // Redirect book libraries
    const library = libraryData.library
    if (library.mediaType === 'book') {
      return redirect(`/library/${libraryId}`)
    }

    return {
      libraryId: params.library
    }
  },
  data() {
    return {
      episodesDownloading: [],
      episodeDownloadsQueued: [],
      processing: false,
      transcriptionStatus: {
        isProcessing: false,
        currentEpisodeId: null,
        queueLength: 0,
        queue: []
      },
      loadingTranscriptionStatus: false,
      transcriptionStatusInterval: null,
      libraryItems: {}
    }
  },
  computed: {
    bookCoverAspectRatio() {
      return this.$store.getters['libraries/getBookCoverAspectRatio']
    },
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    transcriptionQueue() {
      return this.transcriptionStatus?.queue?.filter(item => {
        const libraryItem = this.libraryItems[item.libraryItemId]
        return libraryItem && libraryItem.libraryId === this.libraryId
      }) || []
    },
    currentTranscriptionCover() {
      if (!this.transcriptionStatus?.currentEpisode) return null
      return this.$store.getters['globals/getLibraryItemCoverSrcById'](this.transcriptionStatus.currentEpisode.libraryItemId)
    }
  },
  methods: {
    episodeDownloadQueued(episodeDownload) {
      if (episodeDownload.libraryId === this.libraryId) {
        this.episodeDownloadsQueued.push(episodeDownload)
      }
    },
    episodeDownloadStarted(episodeDownload) {
      if (episodeDownload.libraryId === this.libraryId) {
        this.episodeDownloadsQueued = this.episodeDownloadsQueued.filter((d) => d.id !== episodeDownload.id)
        this.episodesDownloading.push(episodeDownload)
      }
    },
    episodeDownloadFinished(episodeDownload) {
      if (episodeDownload.libraryId === this.libraryId) {
        this.episodeDownloadsQueued = this.episodeDownloadsQueued.filter((d) => d.id !== episodeDownload.id)
        this.episodesDownloading = this.episodesDownloading.filter((d) => d.id !== episodeDownload.id)
      }
    },
    async loadInitialDownloadQueue() {
      this.processing = true
      const queuePayload = await this.$axios.$get(`/api/libraries/${this.libraryId}/episode-downloads`).catch((error) => {
        console.error('Failed to get download queue', error)
        this.$toast.error(this.$strings.ToastFailedToLoadData)
        return null
      })
      this.processing = false
      this.episodeDownloadsQueued = queuePayload?.queue || []

      if (queuePayload?.currentDownload) {
        this.episodesDownloading.push(queuePayload.currentDownload)
      }

      // Initialize listeners after load to prevent event race conditions
      this.initListeners()
    },
    initListeners() {
      this.$root.socket.on('episode_download_queued', this.episodeDownloadQueued)
      this.$root.socket.on('episode_download_started', this.episodeDownloadStarted)
      this.$root.socket.on('episode_download_finished', this.episodeDownloadFinished)
    },
    async refreshTranscriptionStatus() {
      if (this.loadingTranscriptionStatus) return
      
      this.loadingTranscriptionStatus = true
      try {
        const response = await this.$axios.$get('/api/podcasts/transcription-status')
        this.transcriptionStatus = response
        
        // Fetch library item details for queue items and current episode
        const allLibraryItemIds = [...new Set(this.transcriptionStatus.queue.map(item => item.libraryItemId))]
        if (this.transcriptionStatus.currentEpisode) {
          allLibraryItemIds.push(this.transcriptionStatus.currentEpisode.libraryItemId)
        }
        
        for (const libraryItemId of allLibraryItemIds) {
          if (!this.libraryItems[libraryItemId]) {
            try {
              const libraryItem = await this.$axios.$get(`/api/items/${libraryItemId}`)
              this.$set(this.libraryItems, libraryItemId, libraryItem)
            } catch (error) {
              console.error(`Failed to fetch library item ${libraryItemId}:`, error)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch transcription status:', error)
      }
      this.loadingTranscriptionStatus = false
    },
    getCurrentTranscriptionTitle() {
      if (!this.transcriptionStatus?.currentEpisode) return 'Unknown'
      return this.transcriptionStatus.currentEpisode.title || 'Unknown Episode'
    },
    getCurrentTranscriptionPodcast() {
      if (!this.transcriptionStatus?.currentEpisode) return ''
      const libraryItem = this.libraryItems[this.transcriptionStatus.currentEpisode.libraryItemId]
      return libraryItem?.media?.title || ''
    },
    getTranscriptionQueueCover(libraryItemId) {
      return this.$store.getters['globals/getLibraryItemCoverSrcById'](libraryItemId)
    },
    getTranscriptionQueuePodcast(libraryItemId) {
      const libraryItem = this.libraryItems[libraryItemId]
      return libraryItem?.media?.title || 'Unknown Podcast'
    },
    startTranscriptionStatusPolling() {
      // Poll every 5 seconds for updates
      this.transcriptionStatusInterval = setInterval(() => {
        if (!this.loadingTranscriptionStatus) {
          this.refreshTranscriptionStatus()
        }
      }, 5000)
    },
    stopTranscriptionStatusPolling() {
      if (this.transcriptionStatusInterval) {
        clearInterval(this.transcriptionStatusInterval)
        this.transcriptionStatusInterval = null
      }
    }
  },
  mounted() {
    this.loadInitialDownloadQueue()
    this.refreshTranscriptionStatus()
    this.startTranscriptionStatusPolling()
  },
  beforeDestroy() {
    this.$root.socket.off('episode_download_queued', this.episodeDownloadQueued)
    this.$root.socket.off('episode_download_started', this.episodeDownloadStarted)
    this.$root.socket.off('episode_download_finished', this.episodeDownloadFinished)
    this.stopTranscriptionStatusPolling()
  }
}
</script>
