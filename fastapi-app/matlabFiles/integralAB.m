function result = integralAB(a, b, expression, var)
%This function takes the intgral of a variable over the bounds a and b.

    if isstring(expression)
        expression = char(expression);
    end
    if isstring(var)
        var = char(var);
    end

    pattern = ['\<' var '\>'];
    expression = regexprep(expression, pattern, 'x');

    expression = regexprep(expression, '(?<!\.)\^', '.^');
    expression = regexprep(expression, '(?<!\.)\*', '.*');
    expression = regexprep(expression, '(?<!\.)\/', './');

    syms('x');                           
    func = str2func(['@(x)' expression]);                 
    result = integral(func, a, b);

end