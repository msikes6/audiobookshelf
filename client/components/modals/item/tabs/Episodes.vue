<template>
  <div class="w-full h-full overflow-y-auto overflow-x-hidden px-4 py-6">
    <div class="w-full mb-4">
      <div v-if="userIsAdminOrUp" class="flex items-end justify-end mb-4">
        <ui-text-input-with-label ref="lastCheckInput" v-model="lastEpisodeCheckInput" :disabled="checkingNewEpisodes" type="datetime-local" :label="$strings.LabelLookForNewEpisodesAfterDate" class="max-w-xs mr-2" />
        <ui-text-input-with-label ref="maxEpisodesInput" v-model="maxEpisodesToDownload" :disabled="checkingNewEpisodes" type="number" :label="$strings.LabelLimit" class="w-16 mr-2" input-class="h-10">
          <div class="flex -mb-0.5">
            <p class="px-1 text-sm font-semibold" :class="{ 'text-gray-400': checkingNewEpisodes }">{{ $strings.LabelLimit }}</p>
            <ui-tooltip direction="top" :text="$strings.LabelMaxEpisodesToDownload">
              <span class="material-symbols text-base">info</span>
            </ui-tooltip>
          </div>
        </ui-text-input-with-label>
        <ui-btn :loading="checkingNewEpisodes" @click="checkForNewEpisodes">{{ $strings.ButtonCheckAndDownloadNewEpisodes }}</ui-btn>
      </div>

      <!-- Transcription Queue Status -->
      <div v-if="userIsAdminOrUp && transcriptionStatus" class="mb-6">
        <div class="w-full p-4 bg-primary mb-2">
          <div class="flex items-center justify-between">
            <p class="text-lg font-semibold">Transcription Queue</p>
            <div class="flex items-center space-x-2">
              <ui-btn v-if="transcriptionQueue.length > 0" @click="clearTranscriptionQueue" color="error" size="sm">Clear Queue</ui-btn>
              <ui-btn @click="refreshTranscriptionStatus" size="sm" :loading="loadingTranscriptionStatus">
                <span class="material-symbols text-sm">refresh</span>
              </ui-btn>
            </div>
          </div>
        </div>
        
        <div class="bg-bg border border-white/10 rounded p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <span class="w-3 h-3 rounded-full" :class="transcriptionStatus.isProcessing ? 'bg-yellow-500' : 'bg-gray-500'"></span>
                <span class="text-sm">{{ transcriptionStatus.isProcessing ? 'Processing' : 'Idle' }}</span>
              </div>
              <div class="text-sm text-gray-400">
                Queue: {{ transcriptionQueue.length }} episode{{ transcriptionQueue.length !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>
          
          <div v-if="transcriptionStatus.currentEpisodeId" class="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
            <div class="flex items-center space-x-2">
              <span class="material-symbols text-yellow-500 text-sm animate-spin">hourglass_empty</span>
              <span class="text-sm">Currently transcribing: {{ getCurrentEpisodeTitle() }}</span>
            </div>
          </div>
          
          <div v-if="transcriptionQueue.length > 0" class="space-y-2">
            <div class="text-sm font-medium text-gray-300 mb-2">Queued Episodes:</div>
            <div v-for="(queueItem, index) in transcriptionQueue.slice(0, 5)" :key="queueItem.episodeId" class="flex items-center justify-between p-2 bg-white/5 rounded">
              <div class="flex items-center space-x-3">
                <span class="text-xs text-gray-400">#{{ index + 1 }}</span>
                <span class="text-sm">{{ queueItem.title }}</span>
                <span class="text-xs px-2 py-1 rounded" :class="queueItem.priority === 'manual' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'">
                  {{ queueItem.priority }}
                </span>
              </div>
            </div>
            <div v-if="transcriptionQueue.length > 5" class="text-xs text-gray-400 text-center">
              ... and {{ transcriptionQueue.length - 5 }} more
            </div>
          </div>
          
          <div v-else-if="!transcriptionStatus.isProcessing" class="text-sm text-gray-400 text-center py-2">
            No episodes in transcription queue
          </div>
        </div>
      </div>

      <div v-if="episodes.length" class="w-full p-4 bg-primary">
        <p>{{ $strings.HeaderEpisodes }}</p>
      </div>
      <div v-if="!episodes.length" class="flex my-4 text-center justify-center text-xl">{{ $strings.MessageNoEpisodes }}</div>
      <table v-else class="text-sm tracksTable">
        <tr>
          <th class="text-center w-20 min-w-20">{{ $strings.LabelEpisode }}</th>
          <th class="text-left">{{ $strings.LabelEpisodeTitle }}</th>
          <th class="text-center w-28">{{ $strings.LabelEpisodeDuration }}</th>
          <th class="text-center w-28">{{ $strings.LabelEpisodeSize }}</th>
        </tr>
        <tr v-for="episode in episodes" :key="episode.id">
          <td class="text-center w-20 min-w-20">
            <p>{{ episode.episode }}</p>
          </td>
          <td dir="auto">
            {{ episode.title }}
          </td>
          <td class="font-mono text-center">
            {{ $secondsToTimestamp(episode.duration) }}
          </td>
          <td class="font-mono text-center">
            {{ $bytesPretty(episode.size) }}
          </td>
        </tr>
      </table>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    libraryItem: {
      type: Object,
      default: () => {}
    }
  },
  data() {
    return {
      checkingNewEpisodes: false,
      lastEpisodeCheckInput: null,
      maxEpisodesToDownload: 3,
      transcriptionStatus: null,
      loadingTranscriptionStatus: false,
      transcriptionStatusInterval: null
    }
  },
  watch: {
    lastEpisodeCheck: {
      handler(newVal) {
        if (newVal) {
          this.setLastEpisodeCheckInput()
        }
      }
    },
    libraryItemId: {
      handler(newVal, oldVal) {
        if (newVal && newVal !== oldVal && this.userIsAdminOrUp) {
          this.refreshTranscriptionStatus()
        }
      }
    }
  },
  computed: {
    userIsAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    autoDownloadEpisodes() {
      return !!this.media.autoDownloadEpisodes
    },
    lastEpisodeCheck() {
      return this.media.lastEpisodeCheck
    },
    media() {
      return this.libraryItem ? this.libraryItem.media || {} : {}
    },
    libraryItemId() {
      return this.libraryItem ? this.libraryItem.id : null
    },
    episodes() {
      return this.media.episodes || []
    },
    transcriptionQueue() {
      return this.transcriptionStatus?.queue || []
    }
  },
  methods: {
    async refreshTranscriptionStatus() {
      if (this.loadingTranscriptionStatus) return
      
      this.loadingTranscriptionStatus = true
      try {
        const response = await this.$axios.$get(`/api/podcasts/${this.libraryItemId}/transcription-queue`)
        this.transcriptionStatus = response.status
      } catch (error) {
        console.error('Failed to fetch transcription status:', error)
        this.$toast.error('Failed to fetch transcription status')
      }
      this.loadingTranscriptionStatus = false
    },
    async clearTranscriptionQueue() {
      if (!confirm('Are you sure you want to clear the transcription queue? This will cancel all pending transcriptions.')) {
        return
      }
      
      try {
        await this.$axios.$delete(`/api/podcasts/${this.libraryItemId}/transcription-queue`)
        this.$toast.success('Transcription queue cleared')
        await this.refreshTranscriptionStatus()
      } catch (error) {
        console.error('Failed to clear transcription queue:', error)
        this.$toast.error('Failed to clear transcription queue')
      }
    },
    getCurrentEpisodeTitle() {
      if (!this.transcriptionStatus?.currentEpisodeId) return 'Unknown'
      
      // Find the episode in our episodes list
      const episode = this.episodes.find(ep => ep.id === this.transcriptionStatus.currentEpisodeId)
      return episode?.title || 'Unknown Episode'
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
    },
    async checkForNewEpisodes() {
      if (this.$refs.lastCheckInput) {
        this.$refs.lastCheckInput.blur()
      }
      if (this.$refs.maxEpisodesInput) {
        this.$refs.maxEpisodesInput.blur()
      }

      if (this.maxEpisodesToDownload < 0) {
        this.maxEpisodesToDownload = 3
        this.$toast.error(this.$strings.ToastInvalidMaxEpisodesToDownload)
        return
      }

      this.checkingNewEpisodes = true
      const lastEpisodeCheck = new Date(this.lastEpisodeCheckInput).valueOf()

      // If last episode check changed then update it first
      if (lastEpisodeCheck && lastEpisodeCheck !== this.lastEpisodeCheck) {
        var updateResult = await this.$axios.$patch(`/api/items/${this.libraryItemId}/media`, { lastEpisodeCheck }).catch((error) => {
          console.error('Failed to update', error)
          return false
        })
        console.log('updateResult', updateResult)
      } else if (!lastEpisodeCheck) {
        this.$toast.error(this.$strings.ToastDateTimeInvalidOrIncomplete)
        this.checkingNewEpisodes = false
        return false
      }

      this.$axios
        .$get(`/api/podcasts/${this.libraryItemId}/checknew?limit=${this.maxEpisodesToDownload}`)
        .then((response) => {
          if (response.episodes && response.episodes.length) {
            console.log('New episodes', response.episodes.length)
            this.$toast.success(this.$getString('ToastNewEpisodesFound', [response.episodes.length]))
          } else {
            this.$toast.info(this.$strings.ToastNoNewEpisodesFound)
          }
          this.checkingNewEpisodes = false
        })
        .catch((error) => {
          console.error('Failed', error)
          var errorMsg = error.response && error.response.data ? error.response.data : 'Unknown Error'
          this.$toast.error(errorMsg)
          this.checkingNewEpisodes = false
        })
    },
    setLastEpisodeCheckInput() {
      this.lastEpisodeCheckInput = this.lastEpisodeCheck ? this.$formatDate(this.lastEpisodeCheck, "yyyy-MM-dd'T'HH:mm") : null
    }
  },
  mounted() {
    this.setLastEpisodeCheckInput()
    if (this.userIsAdminOrUp) {
      this.refreshTranscriptionStatus()
      this.startTranscriptionStatusPolling()
    }
  },
  beforeDestroy() {
    this.stopTranscriptionStatusPolling()
  }
}
</script>
