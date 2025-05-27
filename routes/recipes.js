var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");
console.log("🧪", Object.keys(recipes_utils));

router.get("/", (req, res) => res.send("im here"));


/**
 * This path returns three random recipes from Spooncular or DB 
 */
router.get("/Explore", async (req, res) => {
  try {
    const user_id = req.session?.user_id || null;
    const recipes = await recipes_utils.getExploreRecipes(user_id);

    if (!recipes || recipes.length === 0) {
      return res.status(404).send("No recipes found");
    }

    res.status(200).json(recipes);
  } catch (err) {
    console.error("Explore error:", err.message);
    res.status(500).send("Internal Server Error");
  }
});





router.get("/Family", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipes = await recipes_utils.getFamilyRecipesByUser(user_id);

    if (recipes.length < 3) {
      return res.status(204).send("we need at least 3 recipes");
    }

    res.status(200).send(recipes);
  } catch (error) {
    next(error);
  }
})

router.get("/Family/:recipeId", async (req, res, next) => {
  try {
    const user_id = req.session.user_id;
    const recipeId = req.params.recipeId;
    const recipe = await recipes_utils.getFamilyRecipeById(recipeId, user_id);
    res.status(200).send(recipe);
  } catch (error) {
    if (error.status === 404) {
      res.status(404).send(error.message);
    } else {
      next(error);
    }
  }
});



router.get("/search", async (req, res, next) => {
  try {
    const { query, number, cuisine, diet, intolerance } = req.query;
    const results = await recipes_utils.searchRecipes({
      query,
      number,
      cuisine,
      diet,
      intolerance
    });

    if (results.length === 0) {
      return res.status(204).send("There are no matching recipes");
    }

    res.status(200).send(results);
  } catch (error) {
    if (error.status) {
      res.status(error.status).send({ message: error.message, success: false });
    } else {
      next(error);
    }
  }
});





/**
 * This path returns a full details of a recipe by its id
 */
router.get("/:recipeId", async (req, res, next) => {
  try {
    const recipe = await recipes_utils.getRecipeDetails(req.params.recipeId);
    res.send(recipe);
  } catch (error) {
    next(error);
  }
});






module.exports = router;
