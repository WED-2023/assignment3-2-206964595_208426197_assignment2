
var express = require("express");
var router = express.Router();
const DButils = require("./utils/DButils");
const user_utils = require("./utils/user_utils");
const recipe_utils = require("./utils/recipes_utils");

/**
 * Authenticate all incoming requests by middleware
 */
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


/**
 * This path gets body with recipeId and save this recipe in the favorites list of the logged-in user
 */
router.post('/favorites', async (req,res,next) => {
  try{
    const user_id = req.session.user_id;
    const recipe_id = req.body.recipeId;
    await user_utils.markAsFavorite(user_id,recipe_id);
    res.status(200).send("The Recipe successfully saved as favorite");
    } catch(error){
    next(error);
  }
})

/**
 * This path returns the favorites recipes that were saved by the logged-in user
 */
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

    const ingredients = req.body.ingredients.map(i => i.name);
    const intolerances = recipe_utils.detectIntolerances(ingredients);

    await DButils.execQuery(
      `INSERT INTO recipes (
         id, title, image, readyInMinutes, aggregateLikes,
         vegan, vegetarian, glutenFree, instructions, cuisine,
         ingredients, intolerances
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.body.id,
        req.body.title,
        req.body.image,
        req.body.readyInMinutes,
        req.body.aggregateLikes,
        req.body.vegan,
        req.body.vegetarian,
        req.body.glutenFree,
        req.body.instructions,
        req.body.cuisine,
        JSON.stringify(req.body.ingredients),
        JSON.stringify(intolerances)
      ]
    );

    res.status(201).send({ message: "Recipe added successfully", success: true });
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
       WHERE creator_id = ?`,
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

    // שליפת המתכון לפי ID ולפי המשתמש המחובר
    const results = await DButils.execQuery(
      `SELECT *
       FROM myrecipes
       WHERE id = ? AND creator_id = ?`,
      [recipeId, user_id]
    );

    // אם לא נמצא מתכון כזה או לא שייך למשתמש
    if (results.length === 0) {
      return res.status(404).send({
        message: "Recipe not found",
        success: false
      });
    }

    const recipe = results[0];

    // נבצע JSON.parse רק אם השדות הם מחרוזת (string)
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

    // שליפת 3 המתכונים האחרונים שצפה בהם המשתמש
    const watched = await DButils.execQuery(
      `SELECT recipe_id
       FROM watched_recipes
       WHERE user_id = ?
       ORDER BY watched_at DESC
       LIMIT 3`,
      [user_id]
    );

    const recipeIds = watched.map((r) => r.recipe_id);

    if (recipeIds.length === 0) {
      return res.status(200).send([]); // אין צפיות
    }

    const previews = await Promise.all(
      recipeIds.map(async (id) => {
        try {
          const cleanId = id.trim();

          // אם זה רק מספרים – Spoonacular
          if (/^\d+$/.test(cleanId)) {
            return await recipe_utils.getRecipeDetails(cleanId);
          }

          // אחרת – מתכון אישי (myrecipes)
          const my = await DButils.execQuery(
            `SELECT id, title, image, readyInMinutes AS Time,
                    aggregateLikes AS popularity,
                    vegan, vegetarian, glutenFree
             FROM myrecipes
             WHERE id = ?`,
            [cleanId]
          );
          if (my.length > 0) return my[0];

          return null; // לא נמצא
        } catch (err) {
          return null;
        }
      })
    );

    const validPreviews = previews.filter((r) => r !== null);
    res.status(200).send(validPreviews);
  } catch (error) {
    next(error);
  }
});







module.exports = router;
