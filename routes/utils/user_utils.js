const DButils = require("./DButils");

async function markAsFavorite(user_id, recipe_id){
    await DButils.execQuery(
    `INSERT INTO favoriterecipes (user_id, recipe_id) VALUES (?, ?)`,
    [user_id, recipe_id]
  );

}

async function getFavoriteRecipes(user_id){
    const recipes_id = await DButils.execQuery(`select recipe_id from favoriterecipes where user_id='${user_id}'`);
    return recipes_id;
}

//IDAN ADDED
async function markAsWatched(user_id, recipe_id) {
  try {
    // chck if watched 
    const existing = await DButils.execQuery(
      `SELECT * FROM watched_recipes WHERE user_id = ? AND recipe_id = ?`,
      [user_id, recipe_id]
    );

    if (existing.length === 0) {
      await DButils.execQuery(
        `INSERT INTO watched_recipes (user_id, recipe_id) VALUES (?, ?)`,
        [user_id, recipe_id]
      );
    }
  } catch (err) {
    throw err;
  }
}

async function likeRecipe(recipe_id) {
  const existing = await DButils.execQuery(
    "SELECT * FROM recipe_likes WHERE recipe_id = ?",
    [recipe_id]
  );

  if (existing.length === 0) {
    await DButils.execQuery(
      "INSERT INTO recipe_likes (recipe_id, extra_likes) VALUES (?, 1)",
      [recipe_id]
    );
  } else {
    await DButils.execQuery(
      "UPDATE recipe_likes SET extra_likes = extra_likes + 1 WHERE recipe_id = ?",
      [recipe_id]
    );
  }
}



exports.markAsWatched = markAsWatched;
exports.markAsFavorite = markAsFavorite;
exports.getFavoriteRecipes = getFavoriteRecipes;
exports.likeRecipe = likeRecipe;


