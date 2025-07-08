function result = sigma(var, lower, upper, expr)
% This function computes the summation of expr as var goes from lower to upper.
% Example: su('i', 1, 10, 'i^2') computes sum_{i=1}^{10} i^2

    % Convert var to symbolic
    syms(var);

    % Construct the symbolic expression
    f = str2sym(expr);

    % Do the summation
    result = double(symsum(f, sym(var), lower, upper));
end