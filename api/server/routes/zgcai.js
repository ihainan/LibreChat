const express = require('express');
const { getHighlights } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.get('/highlights', requireJwtAuth, async (req, res) => {
  try {
    const highlights = await getHighlights();
    res.status(200).send({ highlights });
  } catch (error) {
    res.status(500).send({ message: 'Failed to retrieve highlights', error: error.message });
  }
});

module.exports = router;
