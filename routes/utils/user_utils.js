const DButils = require("./DButils");

async function markAsFavorite(user_id, recipe_id){
    await DButils.execQuery(`insert into favoriterecipes values ('${user_id}',${recipe_id})`);
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

async function likeRecipe(user_id, recipe_id) {
  const alreadyLiked = await DButils.execQuery(
    `SELECT * FROM recipe_likes WHERE user_id = ? AND recipe_id = ?`,
    [user_id, recipe_id]
  );
  if (alreadyLiked.length === 0) {
    await DButils.execQuery(
      `INSERT INTO recipe_likes (user_id, recipe_id) VALUES (?, ?)`,
      [user_id, recipe_id]
    );
  }
}


exports.markAsWatched = markAsWatched;
exports.markAsFavorite = markAsFavorite;
exports.getFavoriteRecipes = getFavoriteRecipes;
exports.likeRecipe = likeRecipe;


