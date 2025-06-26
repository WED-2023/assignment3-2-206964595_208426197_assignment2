
export function getRecipeImage(imagePath) {
  if (!imagePath) return null;
  
  // If it's already a full URL (from Spoonacular), return as is
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // import localy
  if (imagePath.includes('/src/assets/images/recipes/')) {
    const filename = imagePath.split('/').pop();
    try {
      // Vue 3 way to import assets dynamically
      return new URL(`../assets/images/recipes/${filename}`, import.meta.url).href;
    } catch (e) {
      console.error('Failed to load local image:', filename);
      return null;
    }
  }
  
  return imagePath;
}
