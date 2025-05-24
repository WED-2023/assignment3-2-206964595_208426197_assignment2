var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");

router.get("/", (req, res) => res.send("im here"));


/**
 * This path returns three random recipes from the DB
 */
router.get("/Explore", async (req, res, next) => {
  try {
    const recipes = await recipes_utils.getRandomRecipesFromDB();
    res.send(recipes);
  } catch (error) {
    next(error);
  }
});


router.get("/Family", async (req, res, next) => {
  try {
    if (!req.session || !req.session.user_id) {
      return res.status(401).send("User not logged in");
    }

    const recipes = await recipes_utils.getFamilyRecipesByUser(req.session.user_id);

    if (recipes.length < 3) {
      return res.status(204).send("we need at least 3 recipes, we must have yuval mom's cheesecake in it");
    }

    res.status(200).send(recipes);
  } catch (error) {
    next(error);
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
