var express = require("express");
var router = express.Router();
const recipes_utils = require("./utils/recipes_utils");

router.get("/", (req, res) => res.send("im here"));


/**
 * This path returns three random recipes from Spooncular or DB 
 */
router.get("/Explore", async (req, res, next) => {
  try {
    const isLoggedIn = !!req.session?.user_id;

    if (!isLoggedIn) {
      const spoonacularRecipes = await recipes_utils.getRandomSpoonacularRecipes(3);
      return res.send(spoonacularRecipes);
    }

    const dbRecipes = await recipes_utils.getRandomRecipesFromDB(); // up to 3
    const spoonacularRecipes = await recipes_utils.getRandomSpoonacularRecipes(3 - dbRecipes.length);

    const combined = [...dbRecipes, ...spoonacularRecipes];
    res.send(combined);
  } catch (error) {
    next(error);
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
