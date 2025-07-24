const { DataTypes } = require('sequelize')

/**
 * Add transcription fields to podcast episodes
 *
 * @param {import('../../Database').sequelize} sequelize
 * @param {import('../Logger')} logger
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info('[2.26.3 migration] Adding transcription fields to PodcastEpisode table')

  try {
    // Helper function to check if column exists
    const columnExists = async (tableName, columnName) => {
      try {
        const table = await queryInterface.describeTable(tableName)
        return table[columnName] !== undefined
      } catch (error) {
        return false
      }
    }

    // Add transcription text column
    if (!(await columnExists('podcastEpisodes', 'transcription'))) {
      await queryInterface.addColumn('podcastEpisodes', 'transcription', {
        type: DataTypes.TEXT,
        allowNull: true
      })
      logger.info('[2.26.3 migration] Added transcription column')
    } else {
      logger.info('[2.26.3 migration] transcription column already exists, skipping')
    }

    // Add transcription status column
    if (!(await columnExists('podcastEpisodes', 'transcriptionStatus'))) {
      await queryInterface.addColumn('podcastEpisodes', 'transcriptionStatus', {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      })
      logger.info('[2.26.3 migration] Added transcriptionStatus column')
    } else {
      logger.info('[2.26.3 migration] transcriptionStatus column already exists, skipping')
    }

    // Add transcription error column
    if (!(await columnExists('podcastEpisodes', 'transcriptionError'))) {
      await queryInterface.addColumn('podcastEpisodes', 'transcriptionError', {
        type: DataTypes.TEXT,
        allowNull: true
      })
      logger.info('[2.26.3 migration] Added transcriptionError column')
    } else {
      logger.info('[2.26.3 migration] transcriptionError column already exists, skipping')
    }

    // Add transcription requested at timestamp
    if (!(await columnExists('podcastEpisodes', 'transcriptionRequestedAt'))) {
      await queryInterface.addColumn('podcastEpisodes', 'transcriptionRequestedAt', {
        type: DataTypes.DATE,
        allowNull: true
      })
      logger.info('[2.26.3 migration] Added transcriptionRequestedAt column')
    } else {
      logger.info('[2.26.3 migration] transcriptionRequestedAt column already exists, skipping')
    }

    logger.info('[2.26.3 migration] Successfully processed transcription fields for PodcastEpisode table')
  } catch (error) {
    logger.error('[2.26.3 migration] Failed to add transcription fields:', error)
    throw error
  }
}

/**
 * Remove transcription fields from podcast episodes
 *
 * @param {import('../../Database').sequelize} sequelize
 * @param {import('../Logger')} logger
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info('[2.26.3 migration] Removing transcription fields from PodcastEpisode table')

  try {
    // Helper function to check if column exists
    const columnExists = async (tableName, columnName) => {
      try {
        const table = await queryInterface.describeTable(tableName)
        return table[columnName] !== undefined
      } catch (error) {
        return false
      }
    }

    // Remove columns only if they exist
    const columnsToRemove = ['transcription', 'transcriptionStatus', 'transcriptionError', 'transcriptionRequestedAt']
    
    for (const columnName of columnsToRemove) {
      if (await columnExists('podcastEpisodes', columnName)) {
        await queryInterface.removeColumn('podcastEpisodes', columnName)
        logger.info(`[2.26.3 migration] Removed ${columnName} column`)
      } else {
        logger.info(`[2.26.3 migration] ${columnName} column doesn't exist, skipping removal`)
      }
    }
    
    logger.info('[2.26.3 migration] Successfully processed transcription field removal from PodcastEpisode table')
  } catch (error) {
    logger.error('[2.26.3 migration] Failed to remove transcription fields:', error)
    throw error
  }
}

module.exports = { up, down }