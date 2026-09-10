function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findBestMatch(queryDescriptor, allFaces) {
  let best = { userId: null, similarity: 0 };
  for (const face of allFaces) {
    const descriptors = face.descriptors; // array 3 angle
    for (const desc of descriptors) {
      const sim = cosineSimilarity(queryDescriptor, desc);
      if (sim > best.similarity) {
        best = { userId: face.userId, similarity: sim };
      }
    }
  }
  return best;
}

module.exports = { cosineSimilarity, findBestMatch };