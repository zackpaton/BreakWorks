function result = integralAB(a, b, expression, var)
%This function takes the intgral of a variable over the bounds a and b.

    if isstring(expression)
        expression = char(expression);
    end
    if isstring(var)
        var = char(var);
    end

    if isempty(regexp(expression, var, 'once'))
        scalar = eval(expression);
        result = scalar * (b - a);
        return;
    end

    pattern = ['\<' var '\>'];
    expression = regexprep(expression, pattern, 'x');

    expression = regexprep(expression, '(?<!\.)\^', '.^');
    expression = regexprep(expression, '(?<!\.)\*', '.*');
    expression = regexprep(expression, '(?<!\.)\/', './');
    
    a = double(a);
    b = double(b);

    func = str2func(['@(x)' expression]);                 
    result = integral(func, a, b);

    result = round(result, 3);

end