
var express = require("express");
var router = express.Router();
const DButils = require("./utils/DButils");
const user_utils = require("./utils/user_utils");
const recipe_utils = require("./utils/recipes_utils");



router.use(async function (req, res, next) {
  if (req.session && req.session.user_id) {
    DButils.execQuery("SELECT user_id FROM users").then((users) => {
      if (users.find((x) => x.user_id === req.session.user_id)) {
        req.user_id = req.session.user_id;
        next();
      }
    }).catch(err => next(err));
  } else {
    res.sendStatus(401);
  }
});


router.post('/favorites', async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipe_id = req.body.recipeId;

    if (!recipe_id) {
      return res.status(400).send("Missing recipeId in request body");
    }

    await user_utils.markAsFavorite(user_id, recipe_id);
    res.status(200).send("The Recipe was successfully saved as favorite");
  } catch (error) {
    next(error);
  }
});

router.get('/favorites', async (req,res,next) => {
  try{
    const user_id = req.session.user_id;
    let favorite_recipes = {};
    const recipes_id = await user_utils.getFavoriteRecipes(user_id);
    let recipes_id_array = [];
    recipes_id.map((element) => recipes_id_array.push(element.recipe_id)); //extracting the recipe ids into array
    const results = await recipe_utils.getRecipesPreview(recipes_id_array);
    res.status(200).send(results);
  } catch(error){
    next(error); 
  }
});

router.post("/my_recipes", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    let ingredients = req.body.ingredients || [];

    if (!Array.isArray(ingredients)) {
      throw { status: 400, message: "Ingredients must be an array" };
    }

    if (ingredients.length > 0 && typeof ingredients[0] === "object" && "name" in ingredients[0]) {
      ingredients = ingredients.map(i => i.name);
    }

    const id = await recipe_utils.createPersonalRecipe(user_id, {
      title: req.body.title,
      image: req.body.image,
      readyInMinutes: req.body.readyInMinutes,
      ingredients,
      instructions: req.body.instructions,
      servings: req.body.servings,
      vegan: req.body.vegan,
      vegetarian: req.body.vegetarian,
      glutenFree: req.body.glutenFree,
    });

    res.status(201).send({ message: "Personal recipe created successfully", id });
  } catch (error) {
    next(error);
  }
});

router.get("/my_recipes", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;

    const myRecipes = await DButils.execQuery(
      `SELECT id, title, image, readyInMinutes AS Time,
              aggregateLikes AS popularity,
              vegan, vegetarian, glutenFree
       FROM myrecipes
       WHERE user_id = ?`,
      [user_id]
    );

    // Add isFavorite and isWatched status for each recipe
    const recipesWithStatus = await Promise.all(
      myRecipes.map(async (recipe) => {
        // Check if this recipe is in user's favorites
        const favoriteCheck = await DButils.execQuery(
          `SELECT 1 FROM favoriterecipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, recipe.id]
        );
        
        // Check if this recipe has been watched
        const watchedCheck = await DButils.execQuery(
          `SELECT 1 FROM watched_recipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, recipe.id]
        );

        return {
          ...recipe,
          isFavorite: favoriteCheck.length > 0,
          isWatched: watchedCheck.length > 0
        };
      })
    );

    res.status(200).send(recipesWithStatus);
  } catch (error) {
    next(error);
  }
});

// Also update the family recipes route
router.get("/family", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipes = await recipe_utils.getFamilyRecipesByUser(user_id);

    if (recipes.length < 3) {
      return res.status(204).send("we need at least 3 recipes");
    }

    // Add isFavorite and isWatched status for each recipe
    const recipesWithStatus = await Promise.all(
      recipes.map(async (recipe) => {
        // Check if this recipe is in user's favorites
        const favoriteCheck = await DButils.execQuery(
          `SELECT 1 FROM favoriterecipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, recipe.id]
        );
        
        // Check if this recipe has been watched  
        const watchedCheck = await DButils.execQuery(
          `SELECT 1 FROM watched_recipes WHERE user_id = ? AND recipe_id = ?`,
          [user_id, recipe.id]
        );

        return {
          ...recipe,
          isFavorite: favoriteCheck.length > 0,
          isWatched: watchedCheck.length > 0
        };
      })
    );

    res.status(200).send(recipesWithStatus);
  } catch (error) {
    next(error);
  }
});

router.get("/my_recipes", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;

    const myRecipes = await DButils.execQuery(
      `SELECT id, title, image, readyInMinutes AS Time,
              aggregateLikes AS popularity,
              vegan, vegetarian, glutenFree
       FROM myrecipes
       WHERE user_id = ?`,
      [user_id]
    );

    res.status(200).send(myRecipes);
  } catch (error) {
    next(error);
  }
});

router.get("/my_recipes/:recipeId", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipeId = req.params.recipeId;

    const results = await DButils.execQuery(
      `SELECT *
       FROM myrecipes
       WHERE id = ? AND user_id = ?`,
      [recipeId, user_id]
    );

    if (results.length === 0) {
      return res.status(404).send({
        message: "Recipe not found",
        success: false
      });
    }

    const recipe = results[0];

    if (typeof recipe.ingredients === "string") {
      recipe.ingredients = JSON.parse(recipe.ingredients);
    }

    if (typeof recipe.intolerances === "string") {
      recipe.intolerances = JSON.parse(recipe.intolerances);
    }

    res.status(200).send(recipe);
  } catch (error) {
    next(error);
  }
});



router.post("/family", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const id = await recipe_utils.createFamilyRecipe(user_id, req.body);
    res.status(201).send({ message: "Family recipe created successfully", id });
  } catch (error) {
    console.error("Error creating family recipe:", error.message);
    next(error);
  }
});


router.get("/family", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipes = await recipe_utils.getFamilyRecipesByUser(user_id);

    if (recipes.length < 3) {
      return res.status(204).send("we need at least 3 recipes");
    }

    res.status(200).send(recipes);
  } catch (error) {
    next(error);
  }
})


router.get("/family/:recipeId", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipeId = req.params.recipeId;
    const recipe = await recipe_utils.getFamilyRecipeById(recipeId, user_id);
    res.status(200).send(recipe);
  } catch (error) {
    if (error.status === 404) {
      res.status(404).send(error.message);
    } else {
      next(error);
    }
  }
});



router.post("/markwatched/:recipeId", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipe_id = req.params.recipeId;

    await user_utils.markAsWatched(user_id, recipe_id);
    res.status(200).send({ message: "Recipe marked as watched" });
  } catch (err) {
    next(err);
  }
});


router.get("/lastWatchedRecipes", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;

    const watched = await DButils.execQuery(
      `SELECT recipe_id
       FROM watched_recipes
       WHERE user_id = ?
       ORDER BY watched_at DESC  
       LIMIT 3`,  
      [user_id]
    );

    const recipeIds = watched.map((r) => r.recipe_id.trim());

    if (recipeIds.length === 0) {
      return res.status(200).send([]);
    }

    const previews = await recipe_utils.getRecipesPreview(recipeIds, user_id);
    res.status(200).send(previews);
  } catch (error) {
    next(error);
  }
});


router.get("/lastsearch", async (req, res, next) => {

  try {

    const results = req.session.lastSearchResults;



    if (!results || results.length === 0) {

      return res.status(204).send("No previous search results");

    }



    res.status(200).send(results);

  } catch (error) {

    next(error);

  }

});











module.exports = router;



